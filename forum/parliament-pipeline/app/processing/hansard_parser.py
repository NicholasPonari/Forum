"""Hansard parser: fetches and parses official transcripts for speaker cross-referencing.

Supports:
- Federal: ourcommons.ca Hansard (HTML/XML)
- Ontario: OLA Hansard (HTML)
- Quebec: Journal des débats (HTML, French)
"""

import logging
import re
from typing import Any
from bs4 import BeautifulSoup
import httpx

logger = logging.getLogger(__name__)


def fetch_and_parse_hansard(debate: dict[str, Any], legislature: dict[str, Any]) -> dict[str, Any]:
    """Fetch and parse the official Hansard for a debate.

    Returns a structured dict with:
    - speakers: list of {name, party, role, order} dicts
    - interventions: list of {speaker_name, text, order} dicts
    - available: bool indicating if Hansard was found and parsed
    """
    hansard_url = debate.get("hansard_url")
    if not hansard_url:
        logger.info(f"No Hansard URL for debate {debate['id']}, skipping cross-reference")
        return {"speakers": [], "interventions": [], "available": False}

    legislature_code = legislature["code"]

    try:
        response = httpx.get(
            hansard_url,
            follow_redirects=True,
            timeout=60,
            headers={"User-Agent": "Vox.Vote Parliament Tracker/1.0"},
        )
        response.raise_for_status()
        html = response.text

        if legislature_code == "CA":
            return _parse_federal_hansard(html)
        elif legislature_code == "ON":
            return _parse_ontario_hansard(html)
        elif legislature_code == "QC":
            return _parse_quebec_hansard(html)
        else:
            logger.warning(f"No Hansard parser for legislature {legislature_code}")
            return {"speakers": [], "interventions": [], "available": False}

    except Exception as e:
        logger.error(f"Failed to fetch/parse Hansard from {hansard_url}: {e}")
        return {"speakers": [], "interventions": [], "available": False}


def _parse_federal_hansard(html: str) -> dict[str, Any]:
    """Parse a federal House of Commons Hansard page.

    The federal Hansard uses structured HTML with speaker divs and intervention content.
    """
    soup = BeautifulSoup(html, "lxml")
    speakers = []
    interventions = []
    seen_speakers = set()
    order = 0

    # Federal Hansard uses specific CSS classes for interventions
    # Common patterns: .intervention, .hansard-content, speaker names in <strong> or <b>
    for block in soup.select(
        ".Intervention, .intervention, [class*='intervention'], "
        ".HansardContent, .hansard-content"
    ):
        # Extract speaker name
        speaker_el = block.select_one(
            ".Affiliation, .PersonSpeaking, .SpeakerName, "
            "strong:first-child, b:first-child, .intervention-header"
        )
        if not speaker_el:
            continue

        speaker_name = _clean_speaker_name(speaker_el.get_text(strip=True))
        if not speaker_name or len(speaker_name) < 2:
            continue

        # Extract party/role info
        party = ""
        role = ""
        affiliation_el = block.select_one(".Affiliation, .PartyAffiliation, .riding")
        if affiliation_el:
            affiliation_text = affiliation_el.get_text(strip=True)
            party_match = re.search(r'\(([^)]+)\)', affiliation_text)
            if party_match:
                party = party_match.group(1).strip()

        # Determine role from context
        name_lower = speaker_name.lower()
        if "speaker" in name_lower or "président" in name_lower:
            role = "Speaker"
        elif "minister" in name_lower or "ministre" in name_lower:
            role = "Minister"
        else:
            role = "MP"

        # Track speaker
        if speaker_name not in seen_speakers:
            speakers.append({
                "name": speaker_name,
                "party": party,
                "role": role,
                "order": order,
            })
            seen_speakers.add(speaker_name)

        # Extract intervention text
        text_parts = []
        for p in block.select("p, .Paratext, .content"):
            # Skip the speaker name element itself
            if p == speaker_el:
                continue
            text = p.get_text(strip=True)
            if text and text != speaker_name:
                text_parts.append(text)

        if text_parts:
            interventions.append({
                "speaker_name": speaker_name,
                "text": " ".join(text_parts),
                "order": order,
            })
            order += 1

    logger.info(f"Federal Hansard parsed: {len(speakers)} speakers, {len(interventions)} interventions")
    return {"speakers": speakers, "interventions": interventions, "available": True}


def _parse_ontario_hansard(html: str) -> dict[str, Any]:
    """Parse an Ontario Legislature Hansard page."""
    soup = BeautifulSoup(html, "lxml")
    speakers = []
    interventions = []
    seen_speakers = set()
    order = 0

    # Ontario Hansard uses similar patterns
    for block in soup.select(
        ".hansard-block, .member-speech, .intervention, "
        "div[class*='speech'], div[class*='intervention']"
    ):
        speaker_el = block.select_one(
            ".member-name, .speaker-name, strong:first-child, b:first-child"
        )
        if not speaker_el:
            continue

        speaker_name = _clean_speaker_name(speaker_el.get_text(strip=True))
        if not speaker_name or len(speaker_name) < 2:
            continue

        party = ""
        party_el = block.select_one(".party, .affiliation")
        if party_el:
            party = party_el.get_text(strip=True)

        role = "MPP"
        if "speaker" in speaker_name.lower():
            role = "Speaker"

        if speaker_name not in seen_speakers:
            speakers.append({
                "name": speaker_name,
                "party": party,
                "role": role,
                "order": order,
            })
            seen_speakers.add(speaker_name)

        text_parts = []
        for p in block.select("p"):
            text = p.get_text(strip=True)
            if text and text != speaker_name:
                text_parts.append(text)

        if text_parts:
            interventions.append({
                "speaker_name": speaker_name,
                "text": " ".join(text_parts),
                "order": order,
            })
            order += 1

    logger.info(f"Ontario Hansard parsed: {len(speakers)} speakers, {len(interventions)} interventions")
    return {"speakers": speakers, "interventions": interventions, "available": True}


def _parse_quebec_hansard(html: str) -> dict[str, Any]:
    """Parse a Quebec National Assembly Journal des débats."""
    soup = BeautifulSoup(html, "lxml")
    speakers = []
    interventions = []
    seen_speakers = set()
    order = 0

    # Quebec uses French terminology
    for block in soup.select(
        ".intervention, .debat-block, "
        "div[class*='intervention'], div[class*='debat']"
    ):
        speaker_el = block.select_one(
            ".orateur, .locuteur, .speaker, strong:first-child, b:first-child"
        )
        if not speaker_el:
            continue

        speaker_name = _clean_speaker_name(speaker_el.get_text(strip=True))
        if not speaker_name or len(speaker_name) < 2:
            continue

        party = ""
        party_el = block.select_one(".parti, .affiliation, .formation")
        if party_el:
            party = party_el.get_text(strip=True)

        role = "MNA"
        name_lower = speaker_name.lower()
        if "président" in name_lower:
            role = "Président"
        elif "ministre" in name_lower or "premier" in name_lower:
            role = "Ministre"

        if speaker_name not in seen_speakers:
            speakers.append({
                "name": speaker_name,
                "party": party,
                "role": role,
                "order": order,
            })
            seen_speakers.add(speaker_name)

        text_parts = []
        for p in block.select("p"):
            text = p.get_text(strip=True)
            if text and text != speaker_name:
                text_parts.append(text)

        if text_parts:
            interventions.append({
                "speaker_name": speaker_name,
                "text": " ".join(text_parts),
                "order": order,
            })
            order += 1

    logger.info(f"Quebec Hansard parsed: {len(speakers)} speakers, {len(interventions)} interventions")
    return {"speakers": speakers, "interventions": interventions, "available": True}


def _clean_speaker_name(raw_name: str) -> str:
    """Clean and normalize a speaker name from Hansard."""
    # Remove common prefixes
    prefixes = [
        r"^(The\s+)?Right\s+Honourable\s+",
        r"^(The\s+)?Honourable\s+",
        r"^(The\s+)?Hon\.\s*",
        r"^Mr\.\s*",
        r"^Mrs\.\s*",
        r"^Ms\.\s*",
        r"^Mme\s+",
        r"^M\.\s+",
        r"^L'honorable\s+",
        r"^Le\s+très\s+honorable\s+",
    ]

    name = raw_name.strip()
    for prefix in prefixes:
        name = re.sub(prefix, "", name, flags=re.IGNORECASE).strip()

    # Remove trailing role indicators like "(Minister of Finance)"
    name = re.sub(r'\s*\([^)]*\)\s*$', '', name).strip()

    # Remove colon at end
    name = name.rstrip(":").strip()

    return name
