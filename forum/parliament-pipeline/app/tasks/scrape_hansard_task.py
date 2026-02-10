"""Hansard scraping task: replaces ingest + transcribe for federal debates.

Instead of downloading video and running Whisper, we scrape the professionally
transcribed Hansard from ourcommons.ca Publication Search. This gives us:
- Speaker name, riding, party, province
- Full speech text with timestamps
- Bill/topic references
- Grouped by Order of Business section
"""

import logging
from app.celery_app import celery
from app.utils.retry import update_debate_status, mark_debate_error
from app.sources.hansard_scraper import scrape_hansard_for_date
from app.utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


@celery.task(
    name="app.tasks.scrape_hansard_task.scrape_hansard",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
)
def scrape_hansard(self, debate_id: str) -> str:
    """Scrape Hansard speeches for a debate and store them.

    This single task replaces the old ingest_debate + transcribe_debate chain.
    It fetches professionally transcribed text directly from ourcommons.ca.

    Returns the debate_id to pass to the next task in the chain.
    """
    logger.info(f"Scraping Hansard for debate: {debate_id}")
    update_debate_status(debate_id, "scraping_hansard")

    try:
        supabase = get_supabase()

        # Get debate info
        debate_result = (
            supabase.table("debates")
            .select("*, legislatures(*)")
            .eq("id", debate_id)
            .limit(1)
            .execute()
        )
        debate = (debate_result.data or [None])[0] if isinstance(debate_result.data, list) else debate_result.data
        if not debate:
            raise ValueError(f"Debate not found: {debate_id}")

        sitting_date = debate["date"]

        # Scrape Hansard speeches from Publication Search
        hansard_data = scrape_hansard_for_date(sitting_date)

        if hansard_data["total_speeches"] == 0:
            raise ValueError(
                f"No Hansard speeches found for {sitting_date}. "
                "The Hansard may not be published yet."
            )

        # Store the raw Hansard data in debate metadata for reference
        supabase.table("debates").update({
            "metadata": {
                **debate.get("metadata", {}),
                "hansard_scraped": True,
                "hansard_speech_count": hansard_data["total_speeches"],
                "hansard_topic_count": len(hansard_data["sections"]),
                "hansard_speaker_count": len(hansard_data["speakers"]),
            },
        }).eq("id", debate_id).execute()

        # Store speakers in debate_speakers table
        for speaker in hansard_data["speakers"]:
            supabase.table("debate_speakers").upsert({
                "debate_id": debate_id,
                "name": speaker["name"],
                "party": speaker.get("party", ""),
                "riding": speaker.get("riding", ""),
                "external_id": speaker.get("member_id"),
                "metadata": {
                    "province": speaker.get("province", ""),
                    "member_url": speaker.get("member_url", ""),
                    "speech_count": speaker.get("speech_count", 0),
                    "source": "hansard_scrape",
                },
            }, on_conflict="debate_id,name").execute()

        # Store contributions (individual speeches) grouped by topic
        order = 0
        for section in hansard_data["sections"]:
            for speech in section["speeches"]:
                supabase.table("debate_contributions").insert({
                    "debate_id": debate_id,
                    "speaker_name": speech["speaker_name"],
                    "text": speech["speech_text"],
                    "sequence_order": order,
                    "metadata": {
                        "riding": speech.get("riding", ""),
                        "party": speech.get("party", ""),
                        "province": speech.get("province", ""),
                        "time": speech.get("time", ""),
                        "page_ref": speech.get("page_ref", ""),
                        "section": speech.get("section", ""),
                        "topics": speech.get("topics", []),
                        "member_url": speech.get("member_url", ""),
                        "source": "hansard_scrape",
                    },
                }).execute()
                order += 1

        # Store topic sections for later use in summarization/publishing
        for i, section in enumerate(hansard_data["sections"]):
            supabase.table("debate_topics").upsert({
                "debate_id": debate_id,
                "topic_title": section["topic_title"],
                "topic_external_id": section.get("topic_id", ""),
                "section": section["section"],
                "speech_count": len(section["speeches"]),
                "speaker_count": section["speaker_count"],
                "parties_involved": section["parties_involved"],
                "sequence_order": i,
            }, on_conflict="debate_id,topic_title").execute()

        logger.info(
            f"Hansard scrape complete for {debate_id}: "
            f"{hansard_data['total_speeches']} speeches, "
            f"{len(hansard_data['sections'])} topics"
        )
        return debate_id

    except Exception as e:
        logger.error(f"Hansard scrape failed for {debate_id}: {e}")
        can_retry = mark_debate_error(debate_id, str(e))
        if can_retry:
            raise self.retry(exc=e)
        raise
