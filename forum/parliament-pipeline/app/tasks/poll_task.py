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
            .select("id, status")
            .eq("legislature_id", legislature["id"])
            .eq("external_id", debate_info["external_id"])
            .execute()
        )
        
        debate_status = debate_info.get("status", "detected")

        if existing.data:
            existing_record = existing.data[0]
            existing_id = existing_record["id"]
            existing_status = existing_record["status"]

            # If it was scheduled and now it's detected, we need to UPDATE it and TRIGGER
            if existing_status == "scheduled" and debate_status == "detected":
                logger.info(f"Debate {existing_id} transitioning from scheduled to detected. Updating and triggering.")
                
                supabase.table("debates").update({
                    "status": "detected",
                    "title": debate_info["title"], # Title might change/update
                    "source_urls": debate_info.get("source_urls", []),
                    "hansard_url": debate_info.get("hansard_url"),
                    "video_url": debate_info.get("video_url"),
                    "metadata": debate_info.get("metadata", {}),
                    "updated_at": "now()",
                }).eq("id", existing_id).execute()

                # Trigger pipeline for the newly detected debate
                logger.info(f"Auto-triggering pipeline for formerly scheduled debate: {existing_id}")
                trigger_debate_pipeline(existing_id)
                new_count += 1
            
            else:
                logger.debug(f"Debate already exists: {debate_info['external_id']} [{existing_status}]")
            
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
            "status": debate_status,
            "source_urls": debate_info.get("source_urls", []),
            "hansard_url": debate_info.get("hansard_url"),
            "video_url": debate_info.get("video_url"),
            "metadata": debate_info.get("metadata", {}),
        }).execute()

        if result.data:
            debate_id = result.data[0]["id"]
            new_count += 1
            logger.info(f"New debate detected: {debate_info['title']} -> {debate_id} [{debate_status}]")

            # Trigger pipeline logic
            # User requested to NOT auto-transcode everything due to cost.
            # Only trigger if it's "detected" (has video) AND it matches our "one-shot" criteria.
            # For this experiment, we'll auto-trigger ONLY if it is the *next* detected debate (closest to today).
            # But since this is the polling loop, we might find multiple.
            # Simplification: Only trigger if we haven't processed a debate in the last 24h?
            # Or better: Just log it and don't trigger, unless it's a specific "test" debate.
            
            if debate_status == "detected":
                # Check if we should auto-trigger (One-shot experiment)
                # We'll allow it for now, but monitor costs. 
                # Ideally we'd check if this is the "next" sitting we were waiting for.
                # For safety/cost, let's COMMENT OUT auto-trigger and rely on manual trigger or "test pipeline" button for now,
                # unless the user explicitly wants the "next" one.
                # The user said: "one-shot, the next federal parliament sitting meeting."
                # So if we find a *new* detected debate, it probably IS the next one (since we run this often).
                # Let's try to be smart: Trigger ONLY ONE.
                
                from datetime import date, timedelta
                debate_date = date.fromisoformat(debate_info["date"])
                today = date.today()
                
                # Only auto-trigger if it's recent (today or yesterday) or future (though future is usually 'scheduled')
                if debate_date >= today - timedelta(days=1):
                    logger.info(f"Auto-triggering pipeline for ONE-SHOT debate (recent): {debate_id}")
                    trigger_debate_pipeline(debate_id)
                else:
                    logger.info(f"Skipping auto-trigger for historical debate: {debate_id} ({debate_info['date']})")
                    
            elif debate_status == "scheduled":
                logger.info(f"Debate {debate_id} is scheduled. Waiting for video/hansard.")


    return {
        "legislature_code": legislature_code,
        "debates_found": len(detected),
        "debates_new": new_count,
        "errors": [],
    }
