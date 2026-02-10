"""Polling tasks: detect new parliamentary debates from all sources."""

import logging
from celery import chain
from app.celery_app import celery
from app.utils.supabase_client import get_supabase
from app.sources.base import get_poller

logger = logging.getLogger(__name__)


LEGISLATURE_CODES = ["CA", "ON", "QC"]


def trigger_debate_pipeline(debate_id: str, from_stage: str = "detected"):
    """Trigger the processing pipeline for a single debate from a given stage."""
    from app.tasks.ingest_task import ingest_debate
    from app.tasks.transcribe_task import transcribe_debate
    from app.tasks.process_task import process_debate
    from app.tasks.summarize_task import summarize_debate
    from app.tasks.publish_task import publish_debate

    # Build chain based on starting stage
    stages = {
        "detected": [ingest_debate, transcribe_debate, process_debate, summarize_debate, publish_debate],
        "ingesting": [ingest_debate, transcribe_debate, process_debate, summarize_debate, publish_debate],
        "transcribing": [transcribe_debate, process_debate, summarize_debate, publish_debate],
        "processing": [process_debate, summarize_debate, publish_debate],
        "summarizing": [summarize_debate, publish_debate],
        "categorizing": [publish_debate],
        "publishing": [publish_debate],
    }

    tasks = stages.get(from_stage, stages["detected"])
    if not tasks:
        logger.warning(f"No tasks for stage {from_stage}")
        return

    # Build Celery chain: first task gets debate_id, rest chain results
    task_chain = chain(
        tasks[0].s(debate_id),
        *[t.s() for t in tasks[1:]]
    )
    task_chain.apply_async()
    logger.info(f"Pipeline triggered for debate {debate_id} from stage {from_stage}")


@celery.task(name="app.tasks.poll_task.poll_all_sources")
def poll_all_sources():
    """Poll all configured legislature sources for new debates."""
    logger.info("Starting poll of all sources")
    results = []

    for code in LEGISLATURE_CODES:
        try:
            result = poll_single_source(code)
            results.append(result)
        except Exception as e:
            logger.error(f"Error polling {code}: {e}")
            results.append({
                "legislature_code": code,
                "debates_found": 0,
                "debates_new": 0,
                "errors": [str(e)],
            })

    logger.info(f"Poll complete: {results}")
    return results


@celery.task(name="app.tasks.poll_task.poll_single_source")
def poll_single_source(legislature_code: str):
    """Poll a single legislature source for new debates."""
    logger.info(f"Polling source: {legislature_code}")
    supabase = get_supabase()

    # Get legislature record
    leg_result = (
        supabase.table("legislatures")
        .select("*")
        .eq("code", legislature_code)
        .single()
        .execute()
    )
    if not leg_result.data:
        raise ValueError(f"Legislature not found: {legislature_code}")

    legislature = leg_result.data

    # Get the appropriate poller
    poller = get_poller(legislature_code)

    # Detect new debates
    detected = poller.detect_new_debates(legislature)

    new_count = 0
    for debate_info in detected:
        # Check if debate already exists (idempotency via external_id)
        existing = (
            supabase.table("debates")
            .select("id")
            .eq("legislature_id", legislature["id"])
            .eq("external_id", debate_info["external_id"])
            .execute()
        )
        if existing.data:
            logger.debug(f"Debate already exists: {debate_info['external_id']}")
            continue

        # Insert new debate
        result = supabase.table("debates").insert({
            "legislature_id": legislature["id"],
            "external_id": debate_info["external_id"],
            "title": debate_info["title"],
            "title_fr": debate_info.get("title_fr"),
            "date": debate_info["date"],
            "session_type": debate_info.get("session_type", "house"),
            "committee_name": debate_info.get("committee_name"),
            "status": "detected",
            "source_urls": debate_info.get("source_urls", []),
            "hansard_url": debate_info.get("hansard_url"),
            "video_url": debate_info.get("video_url"),
            "metadata": debate_info.get("metadata", {}),
        }).execute()

        if result.data:
            debate_id = result.data[0]["id"]
            new_count += 1
            logger.info(f"New debate detected: {debate_info['title']} -> {debate_id}")

            # Trigger the pipeline for this debate
            trigger_debate_pipeline(debate_id)

    return {
        "legislature_code": legislature_code,
        "debates_found": len(detected),
        "debates_new": new_count,
        "errors": [],
    }
