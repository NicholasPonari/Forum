"""Post-processing task: speaker mapping, contribution extraction, vote lookup.

For Hansard-first debates (federal):
  - Contributions and speakers are already stored by scrape_hansard_task
  - This step enriches data: fetch votes, validate speaker records
  - No transcripts needed — Hansard IS the transcript

For legacy video debates (provincial):
  - Still uses transcripts + Hansard cross-reference
"""

import logging
from app.celery_app import celery
from app.utils.retry import update_debate_status, mark_debate_error
from app.processing.vote_extractor import extract_votes
from app.utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


@celery.task(
    name="app.tasks.process_task.process_debate",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def process_debate(self, debate_id: str) -> str:
    """Post-process a debate: enrich speakers, fetch votes.

    For Hansard-first pipeline: contributions already exist from scrape_hansard_task.
    For legacy pipeline: extracts contributions from transcripts.

    Returns the debate_id to pass to the next task in the chain.
    """
    logger.info(f"Processing debate: {debate_id}")
    update_debate_status(debate_id, "processing")

    try:
        supabase = get_supabase()

        # Get debate + legislature
        debate_result = (
            supabase.table("debates")
            .select("*, legislatures(*)")
            .eq("id", debate_id)
            .single()
            .execute()
        )
        debate = debate_result.data
        legislature = debate["legislatures"]

        metadata = debate.get("metadata", {})
        is_hansard_first = metadata.get("hansard_scraped", False)

        if is_hansard_first:
            # Hansard-first: contributions already stored by scrape_hansard_task
            contrib_result = (
                supabase.table("debate_contributions")
                .select("*")
                .eq("debate_id", debate_id)
                .execute()
            )
            contributions = contrib_result.data or []
            logger.info(
                f"Hansard-first debate {debate_id}: "
                f"{len(contributions)} contributions already stored"
            )

            if not contributions:
                raise ValueError(
                    f"No contributions found for Hansard-first debate {debate_id}. "
                    "The scrape_hansard step may have failed."
                )
        else:
            # Legacy video pipeline: extract contributions from transcripts
            from app.processing.speaker_mapper import map_speakers
            from app.processing.contribution_extractor import extract_contributions
            from app.processing.hansard_parser import fetch_and_parse_hansard

            transcript_result = (
                supabase.table("debate_transcripts")
                .select("*")
                .eq("debate_id", debate_id)
                .execute()
            )
            transcripts = transcript_result.data or []

            if not transcripts:
                raise ValueError(f"No transcripts found for debate {debate_id}")

            hansard_data = fetch_and_parse_hansard(debate, legislature)
            speaker_mappings = map_speakers(
                transcripts=transcripts,
                hansard_data=hansard_data,
                legislature=legislature,
            )
            contributions = extract_contributions(
                transcripts=transcripts,
                speaker_mappings=speaker_mappings,
                debate_id=debate_id,
            )
            if contributions:
                supabase.table("debate_contributions").insert(contributions).execute()
                logger.info(f"Stored {len(contributions)} contributions for debate {debate_id}")

        # Fetch vote data (applies to both pipelines)
        votes = extract_votes(debate, legislature)
        if votes:
            supabase.table("debate_votes").insert(votes).execute()
            logger.info(f"Stored {len(votes)} votes for debate {debate_id}")

        logger.info(f"Processing complete for debate {debate_id}")
        return debate_id

    except Exception as e:
        logger.error(f"Processing failed for {debate_id}: {e}")
        can_retry = mark_debate_error(debate_id, str(e))
        if can_retry:
            raise self.retry(exc=e)
        raise
