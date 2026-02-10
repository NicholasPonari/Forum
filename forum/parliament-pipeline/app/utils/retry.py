"""Retry and backoff helpers for pipeline tasks."""

import logging
from app.utils.supabase_client import get_supabase
from app.config import settings

logger = logging.getLogger(__name__)


def update_debate_status(debate_id: str, status: str, error_message: str | None = None):
    """Update debate status in the database."""
    supabase = get_supabase()
    data: dict = {"status": status}
    if error_message is not None:
        data["error_message"] = error_message
    supabase.table("debates").update(data).eq("id", debate_id).execute()
    logger.info(f"Debate {debate_id} status -> {status}")


def mark_debate_error(debate_id: str, error_message: str):
    """Mark a debate as errored and increment retry count."""
    supabase = get_supabase()
    # Get current retry count
    result = supabase.table("debates").select("retry_count").eq("id", debate_id).single().execute()
    current_retries = (result.data or {}).get("retry_count", 0)

    if current_retries >= settings.max_retries:
        supabase.table("debates").update({
            "status": "error",
            "error_message": f"Max retries exceeded. Last error: {error_message}",
            "retry_count": current_retries + 1,
        }).eq("id", debate_id).execute()
        logger.error(f"Debate {debate_id} exceeded max retries ({settings.max_retries})")
        return False  # No more retries
    else:
        supabase.table("debates").update({
            "error_message": error_message,
            "retry_count": current_retries + 1,
        }).eq("id", debate_id).execute()
        return True  # Can retry
