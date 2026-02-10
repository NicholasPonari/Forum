"""FastAPI application for the Parliament Pipeline service."""

import logging
from fastapi import FastAPI, HTTPException, Depends, Header
from typing import Optional

from app.config import settings
from app.models import (
    PollRequest,
    PollResult,
    PipelineStatus,
    DebateInfo,
    RetriggerRequest,
    HealthResponse,
)
from app.utils.supabase_client import get_supabase
from app.utils.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Parliament Debate Pipeline",
    description="Automated parliamentary debate detection, transcription, and publishing pipeline",
    version="1.0.0",
)


async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify the API key for protected endpoints."""
    if not x_api_key or x_api_key != settings.pipeline_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return x_api_key


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    response = HealthResponse(status="ok")

    # Check Redis
    try:
        from app.celery_app import celery
        celery.control.ping(timeout=2)
        response.redis_connected = True
    except Exception:
        response.redis_connected = False

    # Check Supabase
    try:
        supabase = get_supabase()
        supabase.table("legislatures").select("id").limit(1).execute()
        response.supabase_connected = True
    except Exception:
        response.supabase_connected = False

    return response


@app.post("/api/poll", response_model=list[PollResult])
async def trigger_poll(
    request: PollRequest = PollRequest(),
    _api_key: str = Depends(verify_api_key),
):
    """Trigger polling for new debates. Called by Vercel cron or manually."""
    from app.tasks.poll_task import poll_all_sources, poll_single_source

    if request.legislature_code:
        task = poll_single_source.delay(request.legislature_code)
        logger.info(f"Triggered poll for {request.legislature_code}, task_id={task.id}")
        return [PollResult(
            legislature_code=request.legislature_code,
            debates_found=0,
            debates_new=0,
            errors=[f"Task queued: {task.id}"],
        )]
    else:
        task = poll_all_sources.delay()
        logger.info(f"Triggered poll for all sources, task_id={task.id}")
        return [PollResult(
            legislature_code="ALL",
            debates_found=0,
            debates_new=0,
            errors=[f"Task queued: {task.id}"],
        )]


@app.get("/api/status", response_model=PipelineStatus)
async def pipeline_status(_api_key: str = Depends(verify_api_key)):
    """Get overall pipeline status."""
    supabase = get_supabase()

    # Count debates by status
    result = supabase.table("debates").select("status").execute()
    debates = result.data or []

    by_status: dict[str, int] = {}
    for d in debates:
        s = d["status"]
        by_status[s] = by_status.get(s, 0) + 1

    # Get recent errors
    error_result = (
        supabase.table("debates")
        .select("id, title, error_message, updated_at")
        .eq("status", "error")
        .order("updated_at", desc=True)
        .limit(10)
        .execute()
    )

    return PipelineStatus(
        total_debates=len(debates),
        by_status=by_status,
        recent_errors=error_result.data or [],
    )


@app.get("/api/debates", response_model=list[DebateInfo])
async def list_debates(
    status: Optional[str] = None,
    legislature_code: Optional[str] = None,
    limit: int = 50,
    _api_key: str = Depends(verify_api_key),
):
    """List debates with optional filters."""
    supabase = get_supabase()
    query = supabase.table("debates").select(
        "id, title, date, session_type, status, duration_seconds, created_at, "
        "legislatures(code)"
    )

    if status:
        query = query.eq("status", status)
    if legislature_code:
        # Look up legislature_id first
        leg = supabase.table("legislatures").select("id").eq("code", legislature_code).single().execute()
        if leg.data:
            query = query.eq("legislature_id", leg.data["id"])

    query = query.order("created_at", desc=True).limit(limit)
    result = query.execute()

    return [
        DebateInfo(
            id=d["id"],
            legislature_code=d.get("legislatures", {}).get("code", "??") if d.get("legislatures") else "??",
            title=d["title"],
            date=d["date"],
            session_type=d["session_type"],
            status=d["status"],
            duration_seconds=d.get("duration_seconds"),
            created_at=d["created_at"],
        )
        for d in (result.data or [])
    ]


@app.post("/api/retrigger")
async def retrigger_debate(
    request: RetriggerRequest,
    _api_key: str = Depends(verify_api_key),
):
    """Re-trigger processing for a specific debate from a given stage."""
    from app.tasks.poll_task import trigger_debate_pipeline

    supabase = get_supabase()

    # Reset debate status
    supabase.table("debates").update({
        "status": request.from_stage,
        "error_message": None,
    }).eq("id", request.debate_id).execute()

    # Re-trigger the pipeline
    trigger_debate_pipeline(request.debate_id, from_stage=request.from_stage)

    logger.info(f"Re-triggered debate {request.debate_id} from stage {request.from_stage}")
    return {"status": "queued", "debate_id": request.debate_id, "from_stage": request.from_stage}
