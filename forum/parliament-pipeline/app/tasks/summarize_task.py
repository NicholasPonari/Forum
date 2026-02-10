"""Summarization and categorization task: LLM-based summary generation."""

import logging
from app.celery_app import celery
from app.utils.retry import update_debate_status, mark_debate_error
from app.summarization.summarizer import generate_summary
from app.summarization.categorizer import categorize_debate
from app.utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


@celery.task(
    name="app.tasks.summarize_task.summarize_debate",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def summarize_debate(self, debate_id: str) -> str:
    """Generate EN + FR summaries and categorize the debate.

    Returns the debate_id to pass to the next task in the chain.
    """
    logger.info(f"Summarizing debate: {debate_id}")
    update_debate_status(debate_id, "summarizing")

    try:
        supabase = get_supabase()

        # Get debate info
        debate_result = (
            supabase.table("debates")
            .select("*, legislatures(code, name)")
            .eq("id", debate_id)
            .single()
            .execute()
        )
        debate = debate_result.data

        # Get transcripts (may be empty for Hansard-first debates)
        transcript_result = (
            supabase.table("debate_transcripts")
            .select("*")
            .eq("debate_id", debate_id)
            .execute()
        )
        transcripts = transcript_result.data or []

        # Get debate topics (from Hansard scrape)
        topics_result = (
            supabase.table("debate_topics")
            .select("*")
            .eq("debate_id", debate_id)
            .order("sequence_order")
            .execute()
        )
        debate_topics = topics_result.data or []

        # Get contributions (with speaker info)
        contributions_result = (
            supabase.table("debate_contributions")
            .select("*, debate_speakers(name, party, riding)")
            .eq("debate_id", debate_id)
            .order("sequence_order")
            .execute()
        )
        contributions = contributions_result.data or []

        # Get votes
        votes_result = (
            supabase.table("debate_votes")
            .select("*")
            .eq("debate_id", debate_id)
            .execute()
        )
        votes = votes_result.data or []

        # Generate EN summary
        en_summary = generate_summary(
            debate=debate,
            transcripts=transcripts,
            contributions=contributions,
            votes=votes,
            language="en",
            debate_topics=debate_topics,
        )
        supabase.table("debate_summaries").upsert({
            "debate_id": debate_id,
            "language": "en",
            "summary_text": en_summary["summary_text"],
            "key_participants": en_summary["key_participants"],
            "key_issues": en_summary["key_issues"],
            "outcome_text": en_summary.get("outcome_text"),
            "llm_model": en_summary["model"],
        }, on_conflict="debate_id,language").execute()

        # Generate FR summary
        fr_summary = generate_summary(
            debate=debate,
            transcripts=transcripts,
            contributions=contributions,
            votes=votes,
            language="fr",
            debate_topics=debate_topics,
        )
        supabase.table("debate_summaries").upsert({
            "debate_id": debate_id,
            "language": "fr",
            "summary_text": fr_summary["summary_text"],
            "key_participants": fr_summary["key_participants"],
            "key_issues": fr_summary["key_issues"],
            "outcome_text": fr_summary.get("outcome_text"),
            "llm_model": fr_summary["model"],
        }, on_conflict="debate_id,language").execute()

        # Categorize the debate
        update_debate_status(debate_id, "categorizing")
        categories = categorize_debate(
            debate=debate,
            transcripts=transcripts,
            contributions=contributions,
            en_summary=en_summary,
        )

        # Store categories
        category_records = [
            {
                "debate_id": debate_id,
                "topic_slug": cat["topic_slug"],
                "confidence": cat["confidence"],
                "is_primary": cat.get("is_primary", False),
            }
            for cat in categories
        ]
        if category_records:
            supabase.table("debate_categories").insert(category_records).execute()

        logger.info(f"Summarization complete for debate {debate_id}")
        return debate_id

    except Exception as e:
        logger.error(f"Summarization failed for {debate_id}: {e}")
        can_retry = mark_debate_error(debate_id, str(e))
        if can_retry:
            raise self.retry(exc=e)
        raise
