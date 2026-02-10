"""Base poller class and registry for legislature source pollers."""

import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class BasePoller(ABC):
    """Abstract base class for legislature source pollers.

    Each poller is responsible for:
    1. Checking a legislature's calendar/feed for new or completed sessions
    2. Returning a list of debate info dicts ready for insertion

    Each debate info dict should contain:
    - external_id: str (unique identifier from the source)
    - title: str
    - title_fr: str | None
    - date: str (YYYY-MM-DD)
    - session_type: str (house, committee, question_period, emergency, other)
    - committee_name: str | None
    - source_urls: list[dict] (e.g., [{type: "video", url: "...", label: "ParlVU"}])
    - hansard_url: str | None
    - video_url: str | None
    - metadata: dict
    """

    @abstractmethod
    def detect_new_debates(self, legislature: dict[str, Any]) -> list[dict[str, Any]]:
        """Detect new or completed debates from the source.

        Args:
            legislature: Legislature record from the database.

        Returns:
            List of debate info dicts ready for insertion.
        """
        pass

    def _make_request(self, url: str, **kwargs) -> Any:
        """Make an HTTP request with standard headers and error handling."""
        import httpx

        headers = kwargs.pop("headers", {})
        headers.setdefault("User-Agent", "Vox.Vote Parliament Tracker/1.0 (civic engagement platform)")

        try:
            with httpx.Client(timeout=30, follow_redirects=True) as client:
                response = client.get(url, headers=headers, **kwargs)
                response.raise_for_status()
                return response
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching {url}: {e.response.status_code}")
            raise
        except httpx.RequestError as e:
            logger.error(f"Request error fetching {url}: {e}")
            raise


# Poller registry
_POLLERS: dict[str, BasePoller] = {}


def register_poller(code: str, poller: BasePoller):
    """Register a poller for a legislature code."""
    _POLLERS[code] = poller


def get_poller(code: str) -> BasePoller:
    """Get the poller for a legislature code."""
    if code not in _POLLERS:
        # Lazy import and register pollers
        _register_all_pollers()

    if code not in _POLLERS:
        raise ValueError(f"No poller registered for legislature code: {code}")

    return _POLLERS[code]


def _register_all_pollers():
    """Register all available pollers."""
    from app.sources.federal import FederalPoller
    from app.sources.ontario import OntarioPoller
    from app.sources.quebec import QuebecPoller

    if "CA" not in _POLLERS:
        register_poller("CA", FederalPoller())
    if "ON" not in _POLLERS:
        register_poller("ON", OntarioPoller())
    if "QC" not in _POLLERS:
        register_poller("QC", QuebecPoller())
