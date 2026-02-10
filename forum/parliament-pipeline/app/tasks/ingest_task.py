"""Ingestion task: download media assets for a debate."""

import logging
from app.celery_app import celery
from app.utils.retry import update_debate_status, mark_debate_error
from app.ingestion.downloader import download_media
from app.utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


@celery.task(
    name="app.tasks.ingest_task.ingest_debate",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def ingest_debate(self, debate_id: str) -> str:
    """Download and register media for a debate.

    Returns the debate_id to pass to the next task in the chain.
    """
    logger.info(f"Ingesting debate: {debate_id}")
    update_debate_status(debate_id, "ingesting")

    try:
        supabase = get_supabase()

        # Fetch debate with legislature info
        debate_result = (
            supabase.table("debates")
            .select("*, legislatures(*)")
            .eq("id", debate_id)
            .single()
            .execute()
        )
        debate = debate_result.data
        if not debate:
            raise ValueError(f"Debate not found: {debate_id}")

        legislature = debate["legislatures"]

        # Download media (audio extracted from video)
        media_info = download_media(debate, legislature)

        # Store media asset record
        supabase.table("debate_media_assets").insert({
            "debate_id": debate_id,
            "media_type": media_info["media_type"],
            "source": media_info["source"],
            "original_url": media_info["original_url"],
            "local_path": media_info["local_path"],
            "file_size_bytes": media_info.get("file_size_bytes"),
            "duration_seconds": media_info.get("duration_seconds"),
            "language": media_info.get("language"),
            "status": "ready",
        }).execute()

        # Update debate duration if we learned it
        if media_info.get("duration_seconds"):
            supabase.table("debates").update({
                "duration_seconds": media_info["duration_seconds"],
            }).eq("id", debate_id).execute()

        logger.info(f"Ingestion complete for debate {debate_id}")
        return debate_id

    except Exception as e:
        logger.error(f"Ingestion failed for {debate_id}: {e}")
        can_retry = mark_debate_error(debate_id, str(e))
        if can_retry:
            raise self.retry(exc=e)
        raise
