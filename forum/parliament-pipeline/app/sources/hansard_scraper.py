"""Hansard scraper: fetches debate speeches from the Publication Search.

Replaces the video-download + Whisper transcription pipeline.
The House of Commons already provides professionally transcribed Hansard
with full speaker attribution, party, riding, timestamps, and bill references.

Source: https://www.ourcommons.ca/PublicationSearch/en/?PubType=37

Each speech entry provides:
- Speaker name + member page URL
- Riding
- Party + province
- Timestamp (date + time)
- Hansard page reference
- Full speech text
- Bill/topic tags
"""

import logging
import re
from datetime import date, datetime
from typing import Any
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup, Tag

import httpx

logger = logging.getLogger(__name__)

# Publication Search base URL
PUB_SEARCH_BASE = "https://www.ourcommons.ca/PublicationSearch/en/"

# XML feed endpoint (documented under ourcommons.ca Open Data -> Publications Search)
PUB_SEARCH_XML = "https://www.ourcommons.ca/Parliamentarians/en/PublicationSearch"


def _build_http_client() -> httpx.Client:
    return httpx.Client(
        timeout=30,
        http2=True,
        follow_redirects=True,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/121.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-CA,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "Referer": "https://www.ourcommons.ca/PublicationSearch/en/",
        },
    )

# Order of Business sections — used to categorize speeches
ORDER_OF_BUSINESS = {
    "GovernmentOrders": "Government Orders",
    "OralQuestionPeriod": "Oral Question Period",
    "RoutineProceedings": "Routine Proceedings",
    "StatementsbyMembers": "Statements by Members",
    "PrivateMembersBusiness": "Private Members' Business",
    "AdjournmentProceedings": "Adjournment Proceedings",
}


def scrape_hansard_for_date(sitting_date: str, hansard_number: str | None = None) -> dict[str, Any]:
    """Scrape all speeches from a Hansard sitting date.

    Args:
        sitting_date: Date string in YYYY-MM-DD format.
        hansard_number: Optional Hansard number (e.g., "82") for filtering.

    Returns:
        Dict with:
        - sitting_date: str
        - hansard_number: str | None
        - sections: list of section dicts, each containing speeches grouped by topic
        - total_speeches: int
        - speakers: list of unique speaker dicts
    """
    logger.info(f"Scraping Hansard for {sitting_date}")

    all_speeches = []
    topics_seen = set()

    with _build_http_client() as client:
        xml_speeches: list[dict] = []
        try:
            xml_speeches = _scrape_from_publication_search_xml(client, sitting_date)
        except Exception as e:
            logger.warning(f"XML Hansard scrape failed for {sitting_date}: {e}")

        if xml_speeches:
            all_speeches = xml_speeches
            for s in xml_speeches:
                for t in s.get("topics", []):
                    topics_seen.add(t["title"])
        else:
            # Warm-up request to establish cookies/session (some WAF setups block direct deep links)
            try:
                _ = _make_request(client, PUB_SEARCH_BASE, params={"PubType": "37"})
            except Exception as e:
                logger.warning(f"Hansard warm-up request failed: {e}")

            # Scrape each Order of Business section separately for better categorization
            for oob_key, oob_label in ORDER_OF_BUSINESS.items():
                try:
                    section_speeches = _scrape_section(client, sitting_date, oob_key, oob_label)
                    all_speeches.extend(section_speeches)
                    for s in section_speeches:
                        for t in s.get("topics", []):
                            topics_seen.add(t["title"])
                except Exception as e:
                    logger.warning(f"Error scraping {oob_label} for {sitting_date}: {e}")

            # If section-based scrape got nothing, try a broad scrape
            if not all_speeches:
                logger.info(f"Section scrape empty, trying broad scrape for {sitting_date}")
                all_speeches = _scrape_broad(client, sitting_date)

    # Group speeches by topic/bill
    sections = _group_speeches_by_topic(all_speeches)

    # Collect unique speakers
    speakers = _extract_unique_speakers(all_speeches)

    logger.info(
        f"Hansard {sitting_date}: {len(all_speeches)} speeches, "
        f"{len(sections)} topics, {len(speakers)} speakers"
    )

    return {
        "sitting_date": sitting_date,
        "hansard_number": hansard_number,
        "sections": sections,
        "all_speeches": all_speeches,
        "total_speeches": len(all_speeches),
        "speakers": speakers,
    }


def _scrape_section(client: httpx.Client, sitting_date: str, oob_key: str, oob_label: str) -> list[dict]:
    """Scrape speeches from a specific Order of Business section."""
    # Build URL: filter by PubType=37 (Hansard), current session, section, 100 per page
    params = {
        "View": "D",
        "ParlSes": "45-1",
        "oob": oob_key,
        "RPP": "100",
        "Page": "1",
        "PubType": "37",
        "order": "chron",  # Chronological order
    }

    speeches = []
    page = 1

    while True:
        params["Page"] = str(page)

        try:
            response = _make_request(client, PUB_SEARCH_BASE, params=params)
        except Exception as e:
            logger.warning(f"Failed to fetch {oob_label} page {page}: {e}")
            break

        soup = BeautifulSoup(response.text, "lxml")
        page_speeches = _parse_speech_cards(soup, oob_label)

        # Filter to only speeches from our target date
        date_speeches = [s for s in page_speeches if s["date"] == sitting_date]
        speeches.extend(date_speeches)

        # If we got speeches from a different (earlier) date, we've gone past our target
        if page_speeches and not date_speeches:
            other_dates = {s["date"] for s in page_speeches}
            if all(d < sitting_date for d in other_dates):
                break

        # Check for next page
        next_link = soup.select_one("a[href*='Page='][title*='Next'], .pagination a:last-child")
        if not next_link or page >= 20:  # Safety limit
            break
        page += 1

    return speeches


def _scrape_broad(client: httpx.Client, sitting_date: str) -> list[dict]:
    """Broad scrape of all Hansard speeches for a date (no section filter)."""
    params = {
        "View": "D",
        "ParlSes": "45-1",
        "RPP": "100",
        "Page": "1",
        "PubType": "37",
        "order": "chron",
    }

    speeches = []
    page = 1

    while True:
        params["Page"] = str(page)

        try:
            response = _make_request(client, PUB_SEARCH_BASE, params=params)
        except Exception:
            break

        soup = BeautifulSoup(response.text, "lxml")
        page_speeches = _parse_speech_cards(soup, "General")

        date_speeches = [s for s in page_speeches if s["date"] == sitting_date]
        speeches.extend(date_speeches)

        if page_speeches and not date_speeches:
            other_dates = {s["date"] for s in page_speeches}
            if all(d < sitting_date for d in other_dates):
                break

        if page >= 30:
            break
        page += 1

    return speeches


def _parse_speech_cards(soup: BeautifulSoup, section_label: str) -> list[dict]:
    """Parse individual speech cards from the Publication Search results page.

    Each speech card in the Publication Search Detail view contains:
    - Speaker name (linked) with riding in parentheses
    - Date/time and page number
    - Party and province below the photo
    - Speech text (may be truncated)
    - Bill/topic tags at the bottom
    """
    speeches = []

    # The Publication Search uses card-like blocks for each speech
    # Look for the main content container with speech entries
    for card in soup.select(
        ".publication-search-result, .search-result, "
        ".result-card, .hansard-result, "
        "[class*='result-item'], [class*='search-item']"
    ):
        speech = _parse_single_card(card, section_label)
        if speech:
            speeches.append(speech)

    # Fallback: try parsing from the structured Hansard-specific layout
    # The screenshot shows entries with speaker photos, names, timestamps
    if not speeches:
        speeches = _parse_hansard_detail_view(soup, section_label)

    return speeches


def _parse_single_card(card: Tag, section_label: str) -> dict | None:
    """Parse a single speech result card."""
    # Speaker name — usually a linked name like "Doug Eyolfson (Winnipeg West)"
    speaker_link = card.select_one("a[href*='/members/en/']")
    if not speaker_link:
        return None

    speaker_text = speaker_link.get_text(strip=True)
    member_url = speaker_link.get("href", "")
    if member_url.startswith("/"):
        member_url = f"https://www.ourcommons.ca{member_url}"

    # Parse "Name (Riding)" pattern
    name, riding = _parse_speaker_riding(speaker_text)
    if not name:
        return None

    # Extract member ID from URL
    member_id_match = re.search(r'/members/en/(\d+)', member_url)
    member_id = member_id_match.group(1) if member_id_match else None

    # Date/time — looks like "2026-02-09 11:03 [p.5563]"
    date_str = ""
    time_str = ""
    page_ref = ""
    for text_node in card.stripped_strings:
        # Look for date pattern
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})', text_node)
        if date_match:
            date_str = date_match.group(1)
            time_str = date_match.group(2)
        # Look for page reference
        page_match = re.search(r'\[p\.(\d+)\]', text_node)
        if page_match:
            page_ref = page_match.group(1)

    if not date_str:
        return None

    # Party + Province — usually shown as "Lib. (MB)" or "CPC (ON)"
    party = ""
    province = ""
    party_el = card.select_one(".party, .caucus, [class*='party'], [class*='caucus']")
    if party_el:
        party_text = party_el.get_text(strip=True)
        party = party_text
    else:
        # Try to find party from text content
        for text_node in card.stripped_strings:
            party_match = re.match(
                r'^(Lib\.|CPC|NDP|BQ|Green|Ind\.?)\s*\(([A-Z]{2})\)$',
                text_node.strip()
            )
            if party_match:
                party = party_match.group(1)
                province = party_match.group(2)
                break

    # Speech text
    speech_text = ""
    text_els = card.select("p, .speech-text, .content-text, [class*='speech'], [class*='content']")
    for el in text_els:
        # Skip elements that are speaker name or metadata
        if el.select_one("a[href*='/members/']"):
            continue
        text = el.get_text(strip=True)
        if text and len(text) > 20:  # Skip short metadata
            speech_text += text + "\n"

    # Bill/topic tags
    topics = []
    for topic_link in card.select("a[href*='Topic=']"):
        topic_text = topic_link.get_text(strip=True)
        topic_url = topic_link.get("href", "")
        topic_id_match = re.search(r'Topic=(\d+)', topic_url)
        topic_id = topic_id_match.group(1) if topic_id_match else ""
        if topic_text:
            topics.append({
                "title": topic_text,
                "id": topic_id,
                "url": topic_url if topic_url.startswith("http") else f"https://www.ourcommons.ca{topic_url}",
            })

    return {
        "speaker_name": name,
        "riding": riding,
        "member_id": member_id,
        "member_url": member_url,
        "party": party,
        "province": province,
        "date": date_str,
        "time": time_str,
        "page_ref": page_ref,
        "speech_text": speech_text.strip(),
        "topics": topics,
        "section": section_label,
        "order": 0,  # Will be set during grouping
    }


def _parse_hansard_detail_view(soup: BeautifulSoup, section_label: str) -> list[dict]:
    """Fallback parser for the Hansard detail view layout.

    Looks for the structured layout visible in the screenshot where each
    intervention has a speaker photo, name, metadata, and text.
    """
    speeches = []
    order = 0

    # Try broader selectors for the result blocks
    for block in soup.select("div[class*='result'], div[class*='item'], article"):
        # Must have a member link
        member_link = block.select_one("a[href*='/members/en/']")
        if not member_link:
            continue

        speaker_text = member_link.get_text(strip=True)
        name, riding = _parse_speaker_riding(speaker_text)
        if not name:
            continue

        member_url = member_link.get("href", "")
        if member_url and not member_url.startswith("http"):
            member_url = f"https://www.ourcommons.ca{member_url}"

        member_id_match = re.search(r'/members/en/(\d+)', member_url)
        member_id = member_id_match.group(1) if member_id_match else None

        # Gather all text from the block
        all_text = block.get_text(" ", strip=True)

        # Extract date/time
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})', all_text)
        if not date_match:
            continue
        date_str = date_match.group(1)
        time_str = date_match.group(2)

        # Page ref
        page_match = re.search(r'\[p\.(\d+)\]', all_text)
        page_ref = page_match.group(1) if page_match else ""

        # Party
        party = ""
        province = ""
        party_match = re.search(r'(Lib\.|CPC|NDP|BQ|Green|Ind\.?)\s*\(([A-Z]{2})\)', all_text)
        if party_match:
            party = party_match.group(1)
            province = party_match.group(2)

        # Speech text — everything after the metadata
        speech_text = ""
        for p in block.select("p"):
            text = p.get_text(strip=True)
            if text and len(text) > 30 and not re.match(r'\d{4}-\d{2}-\d{2}', text):
                speech_text += text + "\n"

        # Topics
        topics = []
        for topic_link in block.select("a[href*='Topic=']"):
            topic_text = topic_link.get_text(strip=True)
            if topic_text:
                topic_url = topic_link.get("href", "")
                topic_id_match = re.search(r'Topic=(\d+)', topic_url)
                topics.append({
                    "title": topic_text,
                    "id": topic_id_match.group(1) if topic_id_match else "",
                    "url": topic_url,
                })

        speeches.append({
            "speaker_name": name,
            "riding": riding,
            "member_id": member_id,
            "member_url": member_url,
            "party": party,
            "province": province,
            "date": date_str,
            "time": time_str,
            "page_ref": page_ref,
            "speech_text": speech_text.strip(),
            "topics": topics,
            "section": section_label,
            "order": order,
        })
        order += 1

    return speeches


def _group_speeches_by_topic(speeches: list[dict]) -> list[dict]:
    """Group speeches by topic/bill for creating per-topic forum posts.

    Returns list of topic sections, each with:
    - topic_title: str (e.g., "Bill C-230: Financial Administration Act")
    - topic_id: str
    - section: str (e.g., "Government Orders")
    - speeches: list of speech dicts in chronological order
    - speaker_count: int
    - parties_involved: list of str
    """
    topic_groups: dict[str, dict] = {}

    for speech in speeches:
        topics = speech.get("topics", [])
        section = speech.get("section", "General")

        if not topics:
            # No topic tag — group by section
            key = f"__section__{section}"
            if key not in topic_groups:
                topic_groups[key] = {
                    "topic_title": section,
                    "topic_id": "",
                    "section": section,
                    "speeches": [],
                    "speakers": set(),
                    "parties": set(),
                }
        else:
            for topic in topics:
                key = topic.get("id") or topic["title"]
                if key not in topic_groups:
                    topic_groups[key] = {
                        "topic_title": topic["title"],
                        "topic_id": topic.get("id", ""),
                        "section": section,
                        "speeches": [],
                        "speakers": set(),
                        "parties": set(),
                    }

        # Add speech to all its topic groups
        if not topics:
            key = f"__section__{section}"
            topic_groups[key]["speeches"].append(speech)
            topic_groups[key]["speakers"].add(speech["speaker_name"])
            if speech.get("party"):
                topic_groups[key]["parties"].add(speech["party"])
        else:
            for topic in topics:
                key = topic.get("id") or topic["title"]
                topic_groups[key]["speeches"].append(speech)
                topic_groups[key]["speakers"].add(speech["speaker_name"])
                if speech.get("party"):
                    topic_groups[key]["parties"].add(speech["party"])

    # Convert sets to lists for JSON serialization
    result = []
    for group in topic_groups.values():
        group["speaker_count"] = len(group["speakers"])
        group["parties_involved"] = sorted(group["parties"])
        del group["speakers"]
        del group["parties"]
        # Sort speeches chronologically
        group["speeches"].sort(key=lambda s: (s.get("date", ""), s.get("time", "")))
        result.append(group)

    # Sort sections: Government Orders first, then by speech count
    section_priority = {
        "Government Orders": 0,
        "Oral Question Period": 1,
        "Routine Proceedings": 2,
        "Private Members' Business": 3,
        "Statements by Members": 4,
        "Adjournment Proceedings": 5,
        "General": 6,
    }
    result.sort(key=lambda s: (
        section_priority.get(s["section"], 99),
        -len(s["speeches"]),
    ))

    return result


def _extract_unique_speakers(speeches: list[dict]) -> list[dict]:
    """Extract unique speakers from all speeches."""
    seen = {}
    for speech in speeches:
        name = speech["speaker_name"]
        if name not in seen:
            seen[name] = {
                "name": name,
                "riding": speech.get("riding", ""),
                "party": speech.get("party", ""),
                "province": speech.get("province", ""),
                "member_id": speech.get("member_id"),
                "member_url": speech.get("member_url", ""),
                "speech_count": 0,
            }
        seen[name]["speech_count"] += 1

    return sorted(seen.values(), key=lambda s: -s["speech_count"])


def _parse_speaker_riding(text: str) -> tuple[str, str]:
    """Parse 'Name (Riding)' format into (name, riding)."""
    match = re.match(r'^(.+?)\s*\(([^)]+)\)\s*$', text.strip())
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return text.strip(), ""


def _make_request(client: httpx.Client, url: str, params: dict[str, str] | None = None) -> httpx.Response:
    """Make an HTTP request with standard headers."""
    response = client.get(url, params=params)
    response.raise_for_status()
    return response


def _scrape_from_publication_search_xml(client: httpx.Client, sitting_date: str) -> list[dict]:
    params = {
        "PubType": "37",
        "View": "L",
        "xml": "1",
        "RPP": "1000",
        "Page": "1",
        "ParlSes": "45-1",
        "order": "chron",
    }

    response = _make_request(client, PUB_SEARCH_XML, params=params)
    root = ET.fromstring(response.text)

    speeches: list[dict] = []
    order = 0

    for pub in root.findall(".//Publication"):
        pub_date = pub.attrib.get("Date", "")
        hansard_num = pub.attrib.get("Title", "")
        _ = hansard_num

        for item in pub.findall(".//PublicationItem"):
            item_date = item.attrib.get("Date", pub_date)
            if item_date != sitting_date:
                continue

            person = item.find("Person")
            person_id = person.attrib.get("Id") if person is not None else None

            profile_url = ""
            first_name = ""
            last_name = ""
            riding = ""
            party = ""
            province = ""
            if person is not None:
                profile_el = person.find("ProfileUrl")
                if profile_el is not None and (profile_el.text or ""):
                    profile_url = profile_el.text.strip()
                    if profile_url.startswith("//"):
                        profile_url = "https:" + profile_url
                    elif profile_url.startswith("/"):
                        profile_url = "https://www.ourcommons.ca" + profile_url

                fn = person.find("FirstName")
                ln = person.find("LastName")
                first_name = (fn.text or "").strip() if fn is not None else ""
                last_name = (ln.text or "").strip() if ln is not None else ""

                riding_el = person.find("Constituency")
                riding = (riding_el.text or "").strip() if riding_el is not None else ""

                caucus_el = person.find("Caucus")
                if caucus_el is not None:
                    party = (caucus_el.attrib.get("Abbr") or "").strip()

                province_el = person.find("Province")
                if province_el is not None:
                    province = (province_el.attrib.get("Code") or "").strip()

            speaker_name = (f"{first_name} {last_name}").strip() or ""

            oob_el = item.find("OrderOfBusiness")
            section_label = (oob_el.text or "").strip() if oob_el is not None else "General"

            subject_el = item.find("SubjectOfBusiness")
            subject = (subject_el.text or "").strip() if subject_el is not None else ""

            topics: list[dict] = []
            if subject:
                topics.append({"title": subject, "id": "", "url": ""})

            hour = item.attrib.get("Hour")
            minute = item.attrib.get("Minute")
            time_str = ""
            if hour is not None and minute is not None:
                time_str = f"{int(hour):02d}:{int(minute):02d}"

            page_ref = item.attrib.get("Page", "")

            speech_text = ""
            para_texts = item.findall(".//XmlContent//ParaText")
            if para_texts:
                parts: list[str] = []
                for p in para_texts:
                    text = "".join(p.itertext()).strip()
                    if text:
                        parts.append(re.sub(r"\s+", " ", text))
                speech_text = "\n".join(parts).strip()

            if not speaker_name or not speech_text:
                continue

            speeches.append({
                "speaker_name": speaker_name,
                "riding": riding,
                "member_id": person_id,
                "member_url": profile_url,
                "party": party,
                "province": province,
                "date": item_date,
                "time": time_str,
                "page_ref": page_ref,
                "speech_text": speech_text,
                "topics": topics,
                "section": section_label or "General",
                "order": order,
            })
            order += 1

    return speeches
