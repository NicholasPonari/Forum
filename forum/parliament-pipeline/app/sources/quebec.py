"""Quebec National Assembly source poller.

Detects new debates by:
1. Checking the parliamentary calendar
2. Looking for video/audio archives
3. Checking Journal des débats (Hansard equivalent)
"""

import logging
import re
from datetime import date, datetime, timedelta
from typing import Any
from bs4 import BeautifulSoup

from app.sources.base import BasePoller

logger = logging.getLogger(__name__)

ASSNAT_CALENDAR_URL = "https://www.assnat.qc.ca/en/travaux-parlementaires/calendrier-parlementaire.html"
ASSNAT_VIDEO_URL = "https://www.assnat.qc.ca/en/video-audio/index.html"
ASSNAT_JOURNAL_URL = "https://www.assnat.qc.ca/en/travaux-parlementaires/journaux-debats.html"


class QuebecPoller(BasePoller):
    """Poller for the Quebec National Assembly."""

    def detect_new_debates(self, legislature: dict[str, Any]) -> list[dict[str, Any]]:
        """Detect new National Assembly debates."""
        debates = []

        try:
            sitting_days = self._get_recent_sitting_days()
            logger.info(f"Quebec: Found {len(sitting_days)} recent sitting days")

            for sitting_day in sitting_days:
                try:
                    debate_info = self._build_debate_info(sitting_day)
                    if debate_info:
                        debates.append(debate_info)
                except Exception as e:
                    logger.error(f"Error building Quebec debate info for {sitting_day}: {e}")
                    continue

        except Exception as e:
            logger.error(f"Error polling Quebec source: {e}")

        return debates

    def _get_recent_sitting_days(self) -> list[dict]:
        """Get recent sitting days from the National Assembly calendar."""
        sitting_days = []

        try:
            response = self._make_request(ASSNAT_CALENDAR_URL)
            soup = BeautifulSoup(response.text, "lxml")

            today = date.today()
            lookback = today - timedelta(days=7)

            # The assnat calendar typically uses table cells or event divs
            for element in soup.select(".jour-seance, .calendar-day, td[class*='seance'], .event-item"):
                # Try to extract date
                date_text = ""

                # Check for datetime attributes
                for attr in ["data-date", "datetime", "data-jour"]:
                    val = element.get(attr, "")
                    if val:
                        date_text = val[:10]
                        break

                # Try text-based extraction
                if not date_text:
                    text = element.get_text(strip=True)
                    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', text)
                    if date_match:
                        date_text = date_match.group(1)
                    else:
                        # Try French date format: "1er janvier 2026", "15 février 2026"
                        fr_match = re.search(
                            r'(\d{1,2})\s*(er)?\s+'
                            r'(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)'
                            r'\s+(\d{4})',
                            text, re.IGNORECASE
                        )
                        if fr_match:
                            day = int(fr_match.group(1))
                            month_names = {
                                "janvier": 1, "février": 2, "mars": 3, "avril": 4,
                                "mai": 5, "juin": 6, "juillet": 7, "août": 8,
                                "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
                            }
                            month = month_names.get(fr_match.group(3).lower(), 0)
                            year = int(fr_match.group(4))
                            if month:
                                date_text = f"{year}-{month:02d}-{day:02d}"

                if not date_text:
                    continue

                try:
                    sitting_date = datetime.strptime(date_text, "%Y-%m-%d").date()
                except ValueError:
                    continue

                if lookback <= sitting_date <= today:
                    element_text = element.get_text(strip=True).lower()
                    session_type = "house"
                    if "commission" in element_text or "committee" in element_text:
                        session_type = "committee"
                    elif "question" in element_text:
                        session_type = "question_period"

                    sitting_days.append({
                        "date": sitting_date.isoformat(),
                        "type": session_type,
                    })

        except Exception as e:
            logger.warning(f"Assnat calendar scrape failed, using fallback: {e}")
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
        """Build debate info for a Quebec sitting day."""
        sitting_date = sitting_day["date"]
        session_type = sitting_day.get("type", "house")
        external_id = f"qc-{session_type}-{sitting_date}"

        # Check for Journal des débats
        hansard_url = self._find_journal(sitting_date)

        # Check for video
        video_url = self._find_video(sitting_date)

        if not hansard_url and not video_url:
            logger.debug(f"No QC journal or video for {sitting_date}, skipping")
            return None

        source_urls = []
        if video_url:
            source_urls.append({"type": "video", "url": video_url, "label": "Assemblée nationale vidéo"})
        if hansard_url:
            source_urls.append({"type": "hansard", "url": hansard_url, "label": "Journal des débats"})

        return {
            "external_id": external_id,
            "title": f"National Assembly of Quebec - {sitting_date}",
            "title_fr": f"Assemblée nationale du Québec - {sitting_date}",
            "date": sitting_date,
            "session_type": session_type,
            "committee_name": None,
            "source_urls": source_urls,
            "hansard_url": hansard_url,
            "video_url": video_url,
            "metadata": {
                "source": "assnat.qc.ca",
                "province": "QC",
                "primary_language": "fr",
            },
        }

    def _find_journal(self, sitting_date: str) -> str | None:
        """Try to find the Journal des débats for a date."""
        try:
            response = self._make_request(ASSNAT_JOURNAL_URL)
            soup = BeautifulSoup(response.text, "lxml")

            # Look for links containing the date
            for link in soup.select("a"):
                href = link.get("href", "")
                text = link.get_text(strip=True)

                # Check if link text or href contains the date
                if sitting_date in href or sitting_date.replace("-", "") in href:
                    if href.startswith("/"):
                        return f"https://www.assnat.qc.ca{href}"
                    return href

        except Exception as e:
            logger.debug(f"Assnat journal check failed for {sitting_date}: {e}")

        return None

    def _find_video(self, sitting_date: str) -> str | None:
        """Try to find video recording for a date."""
        try:
            response = self._make_request(ASSNAT_VIDEO_URL)
            soup = BeautifulSoup(response.text, "lxml")

            for link in soup.select("a[href*='video'], a[href*='webdiffusion']"):
                href = link.get("href", "")
                text = link.get_text(strip=True)

                if sitting_date in href or sitting_date.replace("-", "") in href:
                    if href.startswith("/"):
                        return f"https://www.assnat.qc.ca{href}"
                    return href

        except Exception as e:
            logger.debug(f"Assnat video check failed for {sitting_date}: {e}")

        return None
