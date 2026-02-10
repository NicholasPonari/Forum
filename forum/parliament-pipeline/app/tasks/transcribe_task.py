"""Transcription task: run Whisper on debate audio."""

import logging
from app.celery_app import celery
from app.utils.retry import update_debate_status, mark_debate_error
from app.transcription.whisper_service import transcribe_audio
from app.utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


@celery.task(
    name="app.tasks.transcribe_task.transcribe_debate",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
)
def transcribe_debate(self, debate_id: str) -> str:
    """Transcribe audio for a debate using faster-whisper.

    Returns the debate_id to pass to the next task in the chain.
    """
    logger.info(f"Transcribing debate: {debate_id}")
    update_debate_status(debate_id, "transcribing")

    try:
        supabase = get_supabase()

        # Get media asset
        media_result = (
            supabase.table("debate_media_assets")
            .select("*")
            .eq("debate_id", debate_id)
            .eq("status", "ready")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not media_result.data:
            raise ValueError(f"No ready media asset for debate {debate_id}")

        media = media_result.data[0]

        # Get debate info (to determine legislature/language)
        debate_result = (
            supabase.table("debates")
            .select("*, legislatures(code)")
            .eq("id", debate_id)
            .single()
            .execute()
        )
        debate = debate_result.data
        legislature_code = debate.get("legislatures", {}).get("code", "CA")

        # Determine languages to transcribe
        # Federal: EN + FR (bilingual parliament)
        # Ontario: EN primarily
        # Quebec: FR primarily
        languages = {
            "CA": ["en", "fr"],
            "ON": ["en"],
            "QC": ["fr"],
        }.get(legislature_code, ["en"])

        for lang in languages:
            logger.info(f"Transcribing {debate_id} in {lang}")
            transcript_result = transcribe_audio(
                audio_path=media["local_path"],
                language=lang,
            )

            # Store transcript
            supabase.table("debate_transcripts").insert({
                "debate_id": debate_id,
                "language": lang,
                "raw_text": transcript_result["raw_text"],
                "segments": transcript_result["segments"],
                "whisper_model": transcript_result["model"],
                "avg_confidence": transcript_result.get("avg_confidence"),
                "word_count": transcript_result.get("word_count"),
                "processing_time_seconds": transcript_result.get("processing_time_seconds"),
            }).execute()

            logger.info(
                f"Transcript stored for {debate_id}/{lang}: "
                f"{transcript_result.get('word_count', 0)} words"
            )

        logger.info(f"Transcription complete for debate {debate_id}")
        return debate_id

    except Exception as e:
        logger.error(f"Transcription failed for {debate_id}: {e}")
        can_retry = mark_debate_error(debate_id, str(e))
        if can_retry:
            raise self.retry(exc=e)
        raise
