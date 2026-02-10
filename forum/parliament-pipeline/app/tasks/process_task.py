"""Post-processing task: speaker mapping, contribution extraction, vote lookup."""

import logging
from app.celery_app import celery
from app.utils.retry import update_debate_status, mark_debate_error
from app.processing.speaker_mapper import map_speakers
from app.processing.contribution_extractor import extract_contributions
from app.processing.vote_extractor import extract_votes
from app.processing.hansard_parser import fetch_and_parse_hansard
from app.utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


@celery.task(
    name="app.tasks.process_task.process_debate",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def process_debate(self, debate_id: str) -> str:
    """Post-process a transcribed debate: map speakers, extract contributions and votes.

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

        # Get transcripts
        transcript_result = (
            supabase.table("debate_transcripts")
            .select("*")
            .eq("debate_id", debate_id)
            .execute()
        )
        transcripts = transcript_result.data or []

        if not transcripts:
            raise ValueError(f"No transcripts found for debate {debate_id}")

        # Step 1: Fetch and parse Hansard for speaker cross-reference
        hansard_data = fetch_and_parse_hansard(debate, legislature)

        # Step 2: Map speakers from transcript segments to known speakers
        speaker_mappings = map_speakers(
            transcripts=transcripts,
            hansard_data=hansard_data,
            legislature=legislature,
        )

        # Step 3: Extract individual contributions
        contributions = extract_contributions(
            transcripts=transcripts,
            speaker_mappings=speaker_mappings,
            debate_id=debate_id,
        )

        # Store contributions
        if contributions:
            supabase.table("debate_contributions").insert(contributions).execute()
            logger.info(f"Stored {len(contributions)} contributions for debate {debate_id}")

        # Step 4: Extract / fetch vote data
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
