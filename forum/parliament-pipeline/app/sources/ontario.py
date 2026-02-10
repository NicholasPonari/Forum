"""Ontario Legislature (OLA) source poller.

Detects new debates by:
1. Checking the OLA House calendar
2. Looking for Hansard transcripts and video archives
"""

import logging
import re
from datetime import date, datetime, timedelta
from typing import Any
from bs4 import BeautifulSoup

from app.sources.base import BasePoller

logger = logging.getLogger(__name__)

OLA_CALENDAR_URL = "https://www.ola.org/en/legislative-business/house-calendar"
OLA_HANSARD_BASE = "https://www.ola.org/en/legislative-business/house-documents"


class OntarioPoller(BasePoller):
    """Poller for the Ontario Legislature."""

    def detect_new_debates(self, legislature: dict[str, Any]) -> list[dict[str, Any]]:
        """Detect new Ontario Legislature debates."""
        debates = []

        try:
            sitting_days = self._get_recent_sitting_days()
            logger.info(f"Ontario: Found {len(sitting_days)} recent sitting days")

            for sitting_day in sitting_days:
                try:
                    debate_info = self._build_debate_info(sitting_day)
                    if debate_info:
                        debates.append(debate_info)
                except Exception as e:
                    logger.error(f"Error building Ontario debate info for {sitting_day}: {e}")
                    continue

        except Exception as e:
            logger.error(f"Error polling Ontario source: {e}")

        return debates

    def _get_recent_sitting_days(self) -> list[dict]:
        """Get recent sitting days from the OLA calendar."""
        sitting_days = []

        try:
            response = self._make_request(OLA_CALENDAR_URL)
            soup = BeautifulSoup(response.text, "lxml")

            today = date.today()
            lookback = today - timedelta(days=7)

            # OLA calendar uses a table with dates and session types
            for row in soup.select("table tr, .calendar-event, .sitting-day"):
                # Try to extract date from the row
                date_text = ""
                for cell in row.select("td, .date, time"):
                    text = cell.get_text(strip=True)
                    datetime_attr = cell.get("datetime", "")
                    if datetime_attr:
                        date_text = datetime_attr[:10]
                        break
                    # Try to parse date from text
                    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', text)
                    if date_match:
                        date_text = date_match.group(1)
                        break

                if not date_text:
                    continue

                try:
                    sitting_date = datetime.strptime(date_text, "%Y-%m-%d").date()
                except ValueError:
                    continue

                if lookback <= sitting_date <= today:
                    # Determine session type from content
                    row_text = row.get_text(strip=True).lower()
                    session_type = "house"
                    if "question period" in row_text:
                        session_type = "question_period"
                    elif "committee" in row_text:
                        session_type = "committee"

                    sitting_days.append({
                        "date": sitting_date.isoformat(),
                        "type": session_type,
                        "title_hint": row.get_text(strip=True)[:200],
                    })

        except Exception as e:
            logger.warning(f"OLA calendar scrape failed, using fallback: {e}")
            sitting_days = self._fallback_recent_days()

        return sitting_days

    def _fallback_recent_days(self) -> list[dict]:
        """Fallback: check recent weekdays."""
        days = []
        today = date.today()
        for i in range(1, 8):
            d = today - timedelta(days=i)
            if d.weekday() < 5:
                days.append({"date": d.isoformat(), "type": "house"})
        return days

    def _build_debate_info(self, sitting_day: dict) -> dict | None:
        """Build debate info for an Ontario sitting day."""
        sitting_date = sitting_day["date"]
        session_type = sitting_day.get("type", "house")
        external_id = f"on-{session_type}-{sitting_date}"

        # Check for Hansard availability
        hansard_url = self._find_hansard(sitting_date)

        # Check for video
        video_url = self._find_video(sitting_date)

        # Need at least one source
        if not hansard_url and not video_url:
            logger.debug(f"No ON Hansard or video for {sitting_date}, skipping")
            return None

        source_urls = []
        if video_url:
            source_urls.append({"type": "video", "url": video_url, "label": "OLA Video"})
        if hansard_url:
            source_urls.append({"type": "hansard", "url": hansard_url, "label": "OLA Hansard"})

        title_hint = sitting_day.get("title_hint", "")
        title = f"Ontario Legislature - {sitting_date}"
        if "question period" in title_hint.lower():
            title = f"Ontario Question Period - {sitting_date}"

        return {
            "external_id": external_id,
            "title": title,
            "title_fr": None,
            "date": sitting_date,
            "session_type": session_type,
            "committee_name": None,
            "source_urls": source_urls,
            "hansard_url": hansard_url,
            "video_url": video_url,
            "metadata": {
                "source": "ola.org",
                "province": "ON",
            },
        }

    def _find_hansard(self, sitting_date: str) -> str | None:
        """Try to find OLA Hansard for a date."""
        try:
            # OLA Hansard pages are organized by parliament/session
            # Try a search-based approach
            url = f"{OLA_HANSARD_BASE}?date={sitting_date}"
            response = self._make_request(url)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, "lxml")
                # Look for Hansard links matching the date
                for link in soup.select("a[href*='hansard'], a[href*='transcript']"):
                    href = link.get("href", "")
                    if sitting_date.replace("-", "") in href or sitting_date in href:
                        if href.startswith("/"):
                            return f"https://www.ola.org{href}"
                        return href

        except Exception as e:
            logger.debug(f"OLA Hansard check failed for {sitting_date}: {e}")

        return None

    def _find_video(self, sitting_date: str) -> str | None:
        """Try to find OLA video recording for a date."""
        try:
            # OLA video archives
            url = f"https://www.ola.org/en/legislative-business/video?date={sitting_date}"
            response = self._make_request(url)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, "lxml")
                for link in soup.select("a[href*='video'], a[href*='watch']"):
                    href = link.get("href", "")
                    if sitting_date in href or sitting_date.replace("-", "") in href:
                        if href.startswith("/"):
                            return f"https://www.ola.org{href}"
                        return href

        except Exception as e:
            logger.debug(f"OLA video check failed for {sitting_date}: {e}")

        return None
