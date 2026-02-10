"""Vote extractor: fetches and parses parliamentary vote data.

Sources:
- Federal: openparliament.ca API and House of Commons open data
- Ontario: Embedded in Hansard transcripts
- Quebec: Assemblée nationale vote records
"""

import logging
import re
from datetime import date
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OPENPARLIAMENT_API = "https://api.openparliament.ca"


def extract_votes(debate: dict[str, Any], legislature: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract vote data for a debate.

    Tries official APIs first, then parses from Hansard if available.

    Returns:
        List of vote dicts ready for database insertion.
    """
    legislature_code = legislature["code"]
    debate_date = debate["date"]
    debate_id = debate["id"]

    if legislature_code == "CA":
        return _extract_federal_votes(debate_id, debate_date)
    elif legislature_code == "ON":
        return _extract_ontario_votes(debate_id, debate)
    elif legislature_code == "QC":
        return _extract_quebec_votes(debate_id, debate)
    else:
        return []


def _extract_federal_votes(debate_id: str, debate_date: str) -> list[dict[str, Any]]:
    """Extract federal votes from openparliament.ca API."""
    votes = []

    try:
        # Get votes for this date
        url = f"{OPENPARLIAMENT_API}/votes/?date={debate_date}&format=json"
        response = httpx.get(
            url,
            timeout=30,
            headers={"User-Agent": "Vox.Vote Parliament Tracker/1.0"},
        )

        if response.status_code != 200:
            logger.debug(f"OpenParliament API returned {response.status_code}")
            return votes

        data = response.json()
        vote_list = data.get("objects", [])

        for vote_data in vote_list:
            vote_url = vote_data.get("url", "")

            # Fetch detailed vote data
            try:
                detail_response = httpx.get(
                    f"{OPENPARLIAMENT_API}{vote_url}?format=json",
                    timeout=30,
                    headers={"User-Agent": "Vox.Vote Parliament Tracker/1.0"},
                )

                if detail_response.status_code == 200:
                    detail = detail_response.json()

                    vote_record = {
                        "debate_id": debate_id,
                        "motion_text": detail.get("description", {}).get("en", ""),
                        "motion_text_fr": detail.get("description", {}).get("fr"),
                        "bill_number": _extract_bill_number(detail),
                        "yea": detail.get("yea_total", 0),
                        "nay": detail.get("nay_total", 0),
                        "paired": detail.get("paired_total", 0),
                        "result": "passed" if detail.get("result") == "Agreed to" else "defeated",
                        "source_vote_id": vote_url,
                        "vote_details": _build_vote_details(detail),
                    }

                    votes.append(vote_record)

            except Exception as e:
                logger.warning(f"Failed to fetch vote detail {vote_url}: {e}")
                continue

    except Exception as e:
        logger.warning(f"Failed to fetch federal votes for {debate_date}: {e}")

    logger.info(f"Extracted {len(votes)} federal votes for {debate_date}")
    return votes


def _extract_ontario_votes(debate_id: str, debate: dict) -> list[dict[str, Any]]:
    """Extract Ontario votes from Hansard content.

    Ontario votes are typically embedded in the Hansard as division results.
    """
    votes = []
    hansard_url = debate.get("hansard_url")

    if not hansard_url:
        return votes

    try:
        response = httpx.get(
            hansard_url,
            timeout=60,
            follow_redirects=True,
            headers={"User-Agent": "Vox.Vote Parliament Tracker/1.0"},
        )

        if response.status_code != 200:
            return votes

        # Parse vote divisions from Hansard HTML
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.text, "lxml")

        # Look for division/vote sections
        for division in soup.select(
            ".division, .vote-result, [class*='division'], [class*='vote']"
        ):
            text = division.get_text(strip=True)

            # Parse vote counts
            yea_match = re.search(r'(?:Ayes|Yeas?|In favour)[:\s]*(\d+)', text, re.IGNORECASE)
            nay_match = re.search(r'(?:Nays?|Against|Opposed)[:\s]*(\d+)', text, re.IGNORECASE)

            if yea_match and nay_match:
                yea = int(yea_match.group(1))
                nay = int(nay_match.group(1))

                # Extract motion text (usually preceding the count)
                motion_text = _extract_preceding_motion(division)

                votes.append({
                    "debate_id": debate_id,
                    "motion_text": motion_text,
                    "bill_number": _find_bill_in_text(text),
                    "yea": yea,
                    "nay": nay,
                    "result": "passed" if yea > nay else "defeated",
                    "source_vote_id": f"on-division-{debate['date']}",
                    "vote_details": [],
                })

    except Exception as e:
        logger.warning(f"Failed to extract Ontario votes: {e}")

    return votes


def _extract_quebec_votes(debate_id: str, debate: dict) -> list[dict[str, Any]]:
    """Extract Quebec votes from Journal des débats."""
    votes = []
    hansard_url = debate.get("hansard_url")

    if not hansard_url:
        return votes

    try:
        response = httpx.get(
            hansard_url,
            timeout=60,
            follow_redirects=True,
            headers={"User-Agent": "Vox.Vote Parliament Tracker/1.0"},
        )

        if response.status_code != 200:
            return votes

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.text, "lxml")

        for division in soup.select(
            ".vote, .division, [class*='vote'], [class*='scrutin']"
        ):
            text = division.get_text(strip=True)

            # French vote patterns
            pour_match = re.search(r'(?:Pour|En faveur)[:\s]*(\d+)', text, re.IGNORECASE)
            contre_match = re.search(r'(?:Contre|Opposé)[:\s]*(\d+)', text, re.IGNORECASE)

            if pour_match and contre_match:
                yea = int(pour_match.group(1))
                nay = int(contre_match.group(1))

                abstain_match = re.search(r'(?:Abstentions?)[:\s]*(\d+)', text, re.IGNORECASE)
                abstain = int(abstain_match.group(1)) if abstain_match else 0

                votes.append({
                    "debate_id": debate_id,
                    "motion_text_fr": _extract_preceding_motion(division),
                    "bill_number": _find_bill_in_text(text),
                    "yea": yea,
                    "nay": nay,
                    "abstain": abstain,
                    "result": "passed" if yea > nay else "defeated",
                    "source_vote_id": f"qc-scrutin-{debate['date']}",
                    "vote_details": [],
                })

    except Exception as e:
        logger.warning(f"Failed to extract Quebec votes: {e}")

    return votes


def _extract_bill_number(vote_detail: dict) -> str | None:
    """Extract bill number from openparliament vote detail."""
    bill = vote_detail.get("bill_url", "")
    if bill:
        # Extract bill number from URL like /bills/44-1/C-123/
        match = re.search(r'/(C-\d+|S-\d+)/', bill)
        if match:
            return match.group(1)
    return None


def _build_vote_details(vote_detail: dict) -> list[dict]:
    """Build individual vote details from openparliament data."""
    # This would involve fetching ballots, which is expensive
    # For V1, just return summary
    return []


def _extract_preceding_motion(element) -> str:
    """Extract the motion text that precedes a vote result."""
    # Look at the previous sibling elements for motion text
    prev = element.find_previous_sibling()
    if prev:
        text = prev.get_text(strip=True)
        if len(text) > 10:
            return text[:500]
    return ""


def _find_bill_in_text(text: str) -> str | None:
    """Find a bill number reference in text."""
    match = re.search(r'(?:Bill|Projet de loi)\s+(C-\d+|S-\d+|\d+)', text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None
