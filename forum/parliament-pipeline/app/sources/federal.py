"""Federal Parliament (House of Commons) source poller.

Hansard-first approach:
1. Scrape the parliamentary-business page for daily agenda + committee meetings
2. Scrape the Hansard Publication Search for completed debate transcripts
3. Extract speaker attributions, topics, and bill references directly from Hansard
   (no video download or Whisper transcription needed — professionals already did it)
"""

import logging
import re
import urllib.parse
from datetime import date, datetime, timedelta
from typing import Any
from bs4 import BeautifulSoup, Tag

from app.sources.base import BasePoller

logger = logging.getLogger(__name__)

# Parliamentary business daily page (replaces old sitting-calendar URL)
# Format: https://www.ourcommons.ca/en/parliamentary-business/YYYY-MM-DD%20-05%3a00
PARLIAMENTARY_BUSINESS_URL = "https://www.ourcommons.ca/en/parliamentary-business"

# Hansard Publication Search — all House debates, already transcribed
HANSARD_SEARCH_URL = "https://www.ourcommons.ca/PublicationSearch/en/"

# Base URL for Hansard document viewer
HANSARD_VIEWER_BASE = "https://www.ourcommons.ca/DocumentViewer/en"


def _build_daily_url(for_date: date) -> str:
    """Build the parliamentary-business URL for a specific date.

    The site expects: /en/parliamentary-business/YYYY-MM-DD%20-05%3a00
    """
    date_str = for_date.strftime("%Y-%m-%d")
    # URL-encode the timezone offset: " -05:00" → "%20-05%3a00"
    return f"{PARLIAMENTARY_BUSINESS_URL}/{urllib.parse.quote(date_str + ' -05:00')}"


class FederalPoller(BasePoller):
    """Poller for the Canadian House of Commons (Hansard-first)."""

    def detect_new_debates(self, legislature: dict[str, Any]) -> list[dict[str, Any]]:
        """Detect new House of Commons debates and committee meetings.

        Strategy:
        1. Scrape parliamentary-business page for today + recent days
           → extracts House agenda, Hansard links, ParlVu links, committee meetings
        2. For any day that has a published Hansard, mark as ready for processing
        3. For today/future days, mark as scheduled with agenda metadata
        """
        debates = []

        today = date.today()
        # Check today + last 3 days for newly published Hansard
        check_dates = [today - timedelta(days=i) for i in range(4)]

        for check_date in check_dates:
            try:
                day_results = self._scrape_daily_page(check_date)
                debates.extend(day_results)
            except Exception as e:
                logger.error(f"Error scraping {check_date}: {e}")
                continue

        # Also check for committee meetings from today's page
        try:
            committee_debates = self._scrape_committee_meetings(today)
            debates.extend(committee_debates)
        except Exception as e:
            logger.warning(f"Error polling federal committees: {e}")

        return debates

    # ------------------------------------------------------------------
    # Daily parliamentary-business page parsing
    # ------------------------------------------------------------------

    def _scrape_daily_page(self, for_date: date) -> list[dict[str, Any]]:
        """Scrape the parliamentary-business page for a given date.

        Extracts:
        - House agenda items (time, title, tooltip description)
        - Hansard link for current and previous sitting
        - ParlVu "Watch Live" link
        - Chamber status (sitting / adjourned)
        """
        url = _build_daily_url(for_date)
        debates = []

        try:
            response = self._make_request(url)
        except Exception as e:
            logger.warning(f"Failed to fetch parliamentary-business for {for_date}: {e}")
            return []

        soup = BeautifulSoup(response.text, "lxml")

        # --- "In the House" section ---
        house_section = soup.select_one("section.block-in-the-chamber")
        if not house_section:
            logger.debug(f"No 'In the House' section found for {for_date}")
            return []

        # Extract ParlVu live/recording link
        parlvu_url = self._extract_parlvu_link(house_section)

        # Extract Hansard links from current and previous sitting
        hansard_info = self._extract_hansard_links(house_section, for_date)

        # Extract agenda items
        agenda_items = self._extract_agenda_items(house_section)

        # Extract chamber status
        chamber_status = self._extract_chamber_status(house_section)

        # Build debate entries
        for sitting in hansard_info:
            sitting_date = sitting["date"]
            external_id = f"ca-house-{sitting_date}"
            hansard_url = sitting.get("hansard_url")
            is_current = sitting.get("is_current", False)

            # Determine status
            sitting_date_obj = datetime.strptime(sitting_date, "%Y-%m-%d").date()
            today = date.today()

            if hansard_url and "active-publication-link" in sitting.get("link_class", ""):
                # Hansard is published and available
                status = "detected"
            elif sitting_date_obj > today:
                status = "scheduled"
            elif sitting_date_obj == today:
                status = "scheduled" if not hansard_url else "detected"
            else:
                # Past day, no Hansard link active → skip
                if not hansard_url:
                    continue
                status = "detected"

            source_urls = []
            calendar_url = _build_daily_url(sitting_date_obj)
            source_urls.append({"type": "calendar", "url": calendar_url, "label": "Parliament Calendar"})

            if hansard_url:
                source_urls.append({"type": "hansard", "url": hansard_url, "label": "Official Hansard"})
            if parlvu_url:
                source_urls.append({"type": "video", "url": parlvu_url, "label": "ParlVU Recording"})

            debates.append({
                "external_id": external_id,
                "title": f"House of Commons Debate — {sitting_date}",
                "title_fr": f"Débat de la Chambre des communes — {sitting_date}",
                "date": sitting_date,
                "session_type": "house",
                "committee_name": None,
                "status": status,
                "source_urls": source_urls,
                "hansard_url": hansard_url,
                "video_url": parlvu_url,
                "metadata": {
                    "source": "ourcommons.ca",
                    "scrape_method": "hansard-first",
                    "chamber_status": chamber_status,
                    "agenda_items": agenda_items if is_current else [],
                    "parlvu_url": parlvu_url,
                },
            })

        return debates

    def _extract_parlvu_link(self, section: Tag) -> str | None:
        """Extract the ParlVu 'Watch Live' or recording link."""
        watch_link = section.select_one(".watch-previous a, a[href*='parlvu'], a[href*='ParlVU'], a[href*='PowerBrowser']")
        if watch_link:
            href = watch_link.get("href", "")
            if href.startswith("//"):
                return f"https:{href}"
            if href.startswith("/"):
                return f"https://parlvu.parl.gc.ca{href}"
            return href
        return None

    def _extract_hansard_links(self, section: Tag, page_date: date) -> list[dict]:
        """Extract Hansard links for current and previous sittings.

        Returns list of dicts with: date, hansard_url, is_current, link_class
        """
        results = []

        # Look for "Current sitting" and "Previous sitting" blocks
        for strong_el in section.select(".strong-text"):
            text = strong_el.get_text(strip=True).lower()
            is_current = "current" in text
            is_previous = "previous" in text

            if not (is_current or is_previous):
                continue

            # The date is in the next sibling .strong-text-date
            date_el = strong_el.find_next_sibling(class_="strong-text-date")
            sitting_date = self._parse_sitting_date(date_el, page_date)
            if not sitting_date:
                continue

            # Find the Hansard link in the associated <ul>
            ul = strong_el.find_next("ul")
            if not ul:
                continue

            hansard_url = None
            link_class = ""
            for li in ul.select("li"):
                link = li.select_one("a")
                if not link:
                    continue
                link_text = link.get_text(strip=True).lower()
                if "debates" in link_text or "hansard" in link_text:
                    href = link.get("href", "")
                    css_classes = " ".join(link.get("class", []))
                    link_class = css_classes

                    # "in-active-publication-link" means not yet available
                    if "in-active-publication-link" in css_classes:
                        hansard_url = None
                    elif href and href != "#":
                        if href.startswith("/"):
                            hansard_url = f"https://www.ourcommons.ca{href}"
                        else:
                            hansard_url = href
                    break

            results.append({
                "date": sitting_date,
                "hansard_url": hansard_url,
                "is_current": is_current,
                "link_class": link_class,
            })

        return results

    def _parse_sitting_date(self, date_el: Tag | None, fallback_date: date) -> str | None:
        """Parse a date from a .strong-text-date element like '(Monday, February 9, 2026)'."""
        if not date_el:
            return fallback_date.isoformat()

        text = date_el.get_text(strip=True)
        # Remove parentheses
        text = text.strip("()")

        # Try parsing formats like "Monday, February 9, 2026"
        for fmt in ["%A, %B %d, %Y", "%B %d, %Y", "%Y-%m-%d"]:
            try:
                return datetime.strptime(text, fmt).date().isoformat()
            except ValueError:
                continue

        logger.debug(f"Could not parse sitting date: {text}")
        return None

    def _extract_agenda_items(self, section: Tag) -> list[dict]:
        """Extract agenda items from the daily agenda widget.

        Each item has: time, title, description (from tooltip), level (1-3)
        """
        items = []
        for row in section.select(".agenda-items .row"):
            # Determine indent level
            classes = " ".join(row.get("class", []))
            level = 1
            if "agenda-lvl2" in classes:
                level = 2
            elif "agenda-lvl3" in classes:
                level = 3

            # Time
            time_el = row.select_one(".the-time")
            time_text = time_el.get_text(strip=True) if time_el else ""

            # Title
            title_el = row.select_one(".agenda-item-title div")
            title_text = title_el.get_text(strip=True) if title_el else ""

            # Subtitle / italic content (bill name, motion description)
            subtitle_el = row.select_one(".item-content, .italic")
            subtitle_text = subtitle_el.get_text(strip=True) if subtitle_el else ""

            # Tooltip description
            tooltip_el = row.select_one("[data-bs-original-title]")
            tooltip_text = tooltip_el.get("data-bs-original-title", "") if tooltip_el else ""

            if title_text:
                items.append({
                    "time": time_text,
                    "title": title_text,
                    "subtitle": subtitle_text,
                    "description": tooltip_text,
                    "level": level,
                })

        return items

    def _extract_chamber_status(self, section: Tag) -> str:
        """Extract the chamber status (e.g., 'The House is currently sitting.')."""
        status_el = section.select_one(".chamber-status")
        if status_el:
            return status_el.get_text(strip=True)
        return "unknown"

    # ------------------------------------------------------------------
    # Committee meetings
    # ------------------------------------------------------------------

    def _scrape_committee_meetings(self, for_date: date) -> list[dict[str, Any]]:
        """Scrape committee meetings from the parliamentary-business page.

        Extracts: acronym, full name, time, location, studies, broadcast type,
                  notice of meeting link, ParlVu/webcast link
        """
        url = _build_daily_url(for_date)
        committees = []

        try:
            response = self._make_request(url)
        except Exception:
            return []

        soup = BeautifulSoup(response.text, "lxml")

        # Committee section
        committee_section = soup.select_one("section.block-committees")
        if not committee_section:
            return []

        # Each committee meeting is in a .panel-accordion or .accordion-item
        for panel in committee_section.select(
            ".panel-accordion, .accordion-item"
        ):
            try:
                meeting = self._parse_committee_panel(panel, for_date)
                if meeting:
                    committees.append(meeting)
            except Exception as e:
                logger.debug(f"Error parsing committee panel: {e}")
                continue

        logger.info(f"Federal committees for {for_date}: {len(committees)} meetings found")
        return committees

    def _parse_committee_panel(self, panel: Tag, for_date: date) -> dict | None:
        """Parse a single committee meeting panel."""
        # Extract acronym
        acronym_el = panel.select_one(
            ".meeting-card-committee-acronym, .meeting-acronym"
        )
        if not acronym_el:
            return None
        acronym = acronym_el.get_text(strip=True)

        # Extract full committee name
        name_el = panel.select_one(
            ".meeting-card-committee-details-name a, "
            "h2.meeting-card-committee-details-name a, "
            "h3.meeting-card-committee-details-name a"
        )
        full_name = name_el.get_text(strip=True) if name_el else acronym

        # Extract time
        time_el = panel.select_one(".the-time, .time")
        time_text = time_el.get_text(strip=True) if time_el else ""

        # Extract location
        location_el = panel.select_one(
            ".meeting-location span, "
            ".meeting-card-attribute.meeting-location span"
        )
        location = location_el.get_text(strip=True) if location_el else ""

        # Extract studies/activities
        studies = []
        for study_el in panel.select(
            ".meeting-card-studies-list li, "
            ".meeting-widget-studies-list li, "
            ".studies-activities-item"
        ):
            study_text = study_el.get_text(strip=True)
            # Also grab the study URL if available
            study_link = study_el.select_one("a")
            study_url = ""
            if study_link:
                href = study_link.get("href", "")
                if href.startswith("//"):
                    study_url = f"https:{href}"
                elif href.startswith("/"):
                    study_url = f"https://www.ourcommons.ca{href}"
                else:
                    study_url = href
            studies.append({"title": study_text, "url": study_url})

        # Determine broadcast type
        broadcast_type = "none"
        if panel.select_one("[class*='icon-television'], .icon-television"):
            broadcast_type = "televised"
        elif panel.select_one("[class*='laptop-play'], .hoc-icons-laptop-play, [class*='web-video-cast']"):
            broadcast_type = "webcast"
        elif panel.select_one("[class*='icon-lock']"):
            broadcast_type = "in_camera"

        # Extract notice of meeting link
        notice_el = panel.select_one("a.btn-meeting-notice")
        notice_url = ""
        if notice_el:
            href = notice_el.get("href", "")
            if href.startswith("//"):
                notice_url = f"https:{href}"
            elif href.startswith("/"):
                notice_url = f"https://www.ourcommons.ca{href}"
            else:
                notice_url = href

        # Build external_id
        meeting_date = for_date.isoformat()
        external_id = f"ca-committee-{acronym}-{meeting_date}"

        source_urls = []
        if notice_url:
            source_urls.append({"type": "notice", "url": notice_url, "label": "Notice of Meeting"})

        study_titles = [s["title"] for s in studies]
        title = f"Committee: {full_name}"
        if study_titles:
            title += f" — {'; '.join(study_titles[:2])}"

        return {
            "external_id": external_id,
            "title": title,
            "title_fr": None,
            "date": meeting_date,
            "session_type": "committee",
            "committee_name": full_name,
            "status": "scheduled",
            "source_urls": source_urls,
            "hansard_url": None,
            "video_url": None,
            "metadata": {
                "source": "ourcommons.ca",
                "scrape_method": "hansard-first",
                "committee_code": acronym,
                "time": time_text,
                "location": location,
                "studies": studies,
                "broadcast_type": broadcast_type,
                "notice_url": notice_url,
            },
        }
