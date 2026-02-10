"""Federal Parliament (House of Commons) source poller.

Detects new debates by:
1. Checking the House of Commons sitting calendar
2. Looking for available ParlVU recordings
3. Checking Hansard availability
"""

import logging
import re
from datetime import date, datetime, timedelta
from typing import Any
from bs4 import BeautifulSoup

from app.sources.base import BasePoller

logger = logging.getLogger(__name__)

# ParlVU events listing (JSON API for recent events)
PARLVU_EVENTS_URL = "https://parlvu.parl.gc.ca/Harmony/en/PowerBrowser/PowerBrowserV2/20160101/-1/null"
# House of Commons Hansard page
HANSARD_BASE_URL = "https://www.ourcommons.ca/documentviewer/en/house"
# Sitting calendar
CALENDAR_URL = "https://www.ourcommons.ca/en/sitting-calendar"


class FederalPoller(BasePoller):
    """Poller for the Canadian House of Commons."""

    def detect_new_debates(self, legislature: dict[str, Any]) -> list[dict[str, Any]]:
        """Detect new House of Commons debates.

        Strategy:
        1. Scrape the sitting calendar for recent sitting days
        2. For each sitting day, check if ParlVU has a recording
        3. Check if Hansard is available
        """
        debates = []

        try:
            # Check recent sitting days from calendar
            sitting_days = self._get_recent_sitting_days()
            logger.info(f"Federal: Found {len(sitting_days)} recent sitting days")

            for sitting_day in sitting_days:
                try:
                    debate_info = self._build_debate_info(sitting_day)
                    if debate_info:
                        debates.append(debate_info)
                except Exception as e:
                    logger.error(f"Error building debate info for {sitting_day}: {e}")
                    continue

        except Exception as e:
            logger.error(f"Error polling federal source: {e}")

        # Also try to detect committee meetings
        try:
            committee_debates = self._get_recent_committee_meetings()
            debates.extend(committee_debates)
        except Exception as e:
            logger.warning(f"Error polling federal committees: {e}")

        return debates

    def _get_recent_sitting_days(self) -> list[dict]:
        """Get recent sitting days from the House of Commons calendar."""
        sitting_days = []

        try:
            response = self._make_request(CALENDAR_URL)
            soup = BeautifulSoup(response.text, "lxml")

            # Look for sitting day indicators in the calendar
            # The calendar uses CSS classes to indicate sitting days
            today = date.today()
            lookback = today - timedelta(days=7)

            # Find day cells with sitting indicators
            for cell in soup.select(".calendar-day, .sitting-day, td[data-date]"):
                date_attr = cell.get("data-date", "")
                if not date_attr:
                    # Try to extract date from cell content
                    continue

                try:
                    sitting_date = datetime.strptime(date_attr, "%Y-%m-%d").date()
                except (ValueError, TypeError):
                    continue

                # Only look at recent past dates (already concluded)
                if lookback <= sitting_date <= today:
                    # Check if this was a sitting day (has appropriate CSS class or content)
                    if self._is_sitting_day(cell):
                        sitting_days.append({
                            "date": sitting_date.isoformat(),
                            "type": "house",
                        })

        except Exception as e:
            logger.warning(f"Calendar scrape failed, falling back to Hansard check: {e}")
            # Fallback: check the last 7 days via Hansard page
            sitting_days = self._fallback_recent_days()

        return sitting_days

    def _is_sitting_day(self, cell) -> bool:
        """Check if a calendar cell represents a sitting day."""
        classes = cell.get("class", [])
        if isinstance(classes, str):
            classes = classes.split()

        sitting_indicators = ["sitting", "house-sitting", "chamber", "active"]
        return any(indicator in " ".join(classes).lower() for indicator in sitting_indicators)

    def _fallback_recent_days(self) -> list[dict]:
        """Fallback: assume weekdays in the last 7 days might be sitting days."""
        days = []
        today = date.today()
        for i in range(1, 8):
            d = today - timedelta(days=i)
            # Weekdays only (Mon-Fri)
            if d.weekday() < 5:
                days.append({"date": d.isoformat(), "type": "house"})
        return days

    def _build_debate_info(self, sitting_day: dict) -> dict | None:
        """Build a debate info dict for a sitting day."""
        sitting_date = sitting_day["date"]
        external_id = f"ca-house-{sitting_date}"

        # Try to find ParlVU recording
        video_url = self._find_parlvu_recording(sitting_date)

        # Try to find Hansard
        hansard_url = self._find_hansard(sitting_date)

        # If neither exists, the session likely hasn't concluded or been published
        if not video_url and not hansard_url:
            logger.debug(f"No recording or Hansard for {sitting_date}, skipping")
            return None

        source_urls = []
        if video_url:
            source_urls.append({"type": "video", "url": video_url, "label": "ParlVU Recording"})
        if hansard_url:
            source_urls.append({"type": "hansard", "url": hansard_url, "label": "Official Hansard"})

        return {
            "external_id": external_id,
            "title": f"House of Commons Debate - {sitting_date}",
            "title_fr": f"Débat de la Chambre des communes - {sitting_date}",
            "date": sitting_date,
            "session_type": "house",
            "committee_name": None,
            "source_urls": source_urls,
            "hansard_url": hansard_url,
            "video_url": video_url,
            "metadata": {
                "source": "ourcommons.ca",
                "sitting_type": sitting_day.get("type", "house"),
            },
        }

    def _find_parlvu_recording(self, sitting_date: str) -> str | None:
        """Try to find a ParlVU recording for a given date."""
        try:
            # ParlVU uses a date-based URL pattern
            # Try to access the events listing and filter by date
            url = f"https://parlvu.parl.gc.ca/Harmony/en/PowerBrowser/PowerBrowserV2/{sitting_date}/-1/null"
            response = self._make_request(url)

            if response.status_code == 200:
                # Parse response to find House event
                soup = BeautifulSoup(response.text, "lxml")
                # Look for links to House of Commons recordings
                for link in soup.select("a[href*='event']"):
                    href = link.get("href", "")
                    text = link.get_text(strip=True).lower()
                    if "house" in text or "chamber" in text or "chambre" in text:
                        if href.startswith("/"):
                            return f"https://parlvu.parl.gc.ca{href}"
                        return href

        except Exception as e:
            logger.debug(f"ParlVU check failed for {sitting_date}: {e}")

        return None

    def _find_hansard(self, sitting_date: str) -> str | None:
        """Try to find the Hansard transcript for a given date."""
        try:
            # Hansard URLs follow a pattern with the date
            # Try the document viewer
            url = f"https://www.ourcommons.ca/DocumentViewer/en/house/{sitting_date}/hansard"
            response = self._make_request(url)

            if response.status_code == 200:
                # Check if it's a valid Hansard page (not a redirect to error)
                if "hansard" in response.text.lower() and "debate" in response.text.lower():
                    return url

        except Exception:
            pass

        return None

    def _get_recent_committee_meetings(self) -> list[dict]:
        """Detect recent committee meetings with recordings."""
        committees = []

        try:
            # Check committee schedule page
            url = "https://www.ourcommons.ca/Committees/en/Home"
            response = self._make_request(url)
            soup = BeautifulSoup(response.text, "lxml")

            today = date.today()
            lookback = today - timedelta(days=3)

            # Look for recent committee meeting links
            for meeting in soup.select(".meeting-item, .committee-meeting, [data-meeting-date]"):
                date_text = meeting.get("data-meeting-date", "")
                if not date_text:
                    continue

                try:
                    meeting_date = datetime.strptime(date_text[:10], "%Y-%m-%d").date()
                except (ValueError, TypeError):
                    continue

                if lookback <= meeting_date <= today:
                    committee_name = meeting.get_text(strip=True)[:100]
                    # Extract committee code if available
                    code_match = re.search(r'\b([A-Z]{4})\b', committee_name)
                    committee_code = code_match.group(1) if code_match else "COMM"

                    external_id = f"ca-committee-{committee_code}-{meeting_date.isoformat()}"

                    committees.append({
                        "external_id": external_id,
                        "title": f"Committee: {committee_name} - {meeting_date.isoformat()}",
                        "title_fr": None,
                        "date": meeting_date.isoformat(),
                        "session_type": "committee",
                        "committee_name": committee_name,
                        "source_urls": [],
                        "hansard_url": None,
                        "video_url": None,
                        "metadata": {"committee_code": committee_code},
                    })

        except Exception as e:
            logger.debug(f"Committee polling failed: {e}")

        return committees
