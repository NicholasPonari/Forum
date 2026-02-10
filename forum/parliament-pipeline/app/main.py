"""FastAPI application for the Parliament Pipeline service."""

import logging
import re
import time
from datetime import date
from fastapi import FastAPI, HTTPException, Depends, Header
from typing import Optional

# Create the app first before any heavy imports
app = FastAPI(
    title="Parliament Debate Pipeline",
    description="Automated parliamentary debate detection, transcription, and publishing pipeline",
    version="1.0.0",
)

# Add CORS middleware for cross-origin requests from frontend
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://www.vox.vote", "https://vox.vote"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Add the simple healthcheck immediately
@app.get("/health/simple")
async def simple_health_check():
    """Simple health check for Railway that always returns 200 OK."""
    return {"status": "ok"}

# Now handle startup and imports
@app.on_event("startup")
async def startup_event():
    """Handle application startup."""
    logger = logging.getLogger(__name__)
    logger.info("Starting Parliament Pipeline API...")
    try:
        # Import configuration and other modules after startup
        from app.config import settings
        from app.models import (
            PollRequest,
            PollResult,
            PipelineStatus,
            DebateInfo,
            RetriggerRequest,
            HealthResponse,
            TestDebateRequest,
        )
        from app.utils.supabase_client import get_supabase
        from app.utils.logging import setup_logging
        
        # Setup logging after import
        setup_logging()
        logger.info("Successfully imported core modules")
    except Exception as e:
        logger.error(f"Failed to import core modules: {e}")
        # Don't raise - let the app start anyway
    logger.info("Parliament Pipeline API started successfully")

# Import the rest after the app is created
from app.config import settings
from app.models import (
    PollRequest,
    PollResult,
    PipelineStatus,
    DebateInfo,
    RetriggerRequest,
    HealthResponse,
    TestDebateRequest,
    TestHansardRequest,
)
from app.utils.supabase_client import get_supabase
from app.utils.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)


async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify the API key for protected endpoints."""
    if not x_api_key or x_api_key != settings.pipeline_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return x_api_key


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    response = HealthResponse(status="ok")

    # Check Redis - make it non-blocking for healthcheck
    try:
        from app.celery_app import celery
        # Use a more lenient check for healthcheck purposes
        inspect = celery.control.inspect()
        stats = inspect.stats()
        response.redis_connected = bool(stats)
    except Exception as e:
        logger.warning(f"Redis healthcheck failed: {e}")
        response.redis_connected = False

    # Check Supabase - make it non-blocking for healthcheck
    try:
        supabase = get_supabase()
        # Use a simpler query that's less likely to fail
        supabase.table("legislatures").select("id").limit(1).execute()
        response.supabase_connected = True
    except Exception as e:
        logger.warning(f"Supabase healthcheck failed: {e}")
        response.supabase_connected = False

    # Always return 200 OK for Railway healthcheck
    # The detailed status is in the response body
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
    trigger_debate_pipeline(
        request.debate_id,
        from_stage=request.from_stage,
        hansard_first=request.hansard_first,
    )

    pipeline_type = "hansard-first" if request.hansard_first else "legacy-video"
    logger.info(f"Re-triggered debate {request.debate_id} from stage {request.from_stage} ({pipeline_type})")
    return {
        "status": "queued",
        "debate_id": request.debate_id,
        "from_stage": request.from_stage,
        "pipeline": pipeline_type,
    }


@app.post("/api/test-debate")
async def create_test_debate(
    request: TestDebateRequest,
    _api_key: str = Depends(verify_api_key),
):
    """Create a test debate from a YouTube URL and run the full pipeline.

    For local/staging testing only. Creates a debate as if it was just scraped,
    with the given YouTube URL as the sole media source, then triggers
    ingest -> transcribe -> process -> summarize -> publish.
    """
    from app.tasks.poll_task import trigger_debate_pipeline

    # Basic YouTube URL validation
    yt_pattern = r"(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})"
    if not re.search(yt_pattern, request.youtube_url.strip()):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    supabase = get_supabase()

    # Get legislature CA
    leg = supabase.table("legislatures").select("id").eq("code", "CA").single().execute()
    if not leg.data:
        raise HTTPException(status_code=500, detail="Legislature CA not found")

    legislature_id = leg.data["id"]
    today = date.today().isoformat()
    external_id = f"test-yt-{today}-{int(time.time() * 1000)}"

    title = request.title or f"Test debate (YouTube) – {today}"

    row = {
        "legislature_id": legislature_id,
        "external_id": external_id,
        "title": title,
        "date": today,
        "session_type": "house",
        "status": "detected",
        "video_url": request.youtube_url.strip(),
        "source_urls": [
            {"type": "video", "url": request.youtube_url.strip(), "label": "YouTube (test)"},
        ],
        "metadata": {"source": "test", "youtube_url": request.youtube_url.strip()},
    }

    result = supabase.table("debates").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create debate")

    debate_id = result.data[0]["id"]
    trigger_debate_pipeline(debate_id, from_stage="detected", hansard_first=False)

    logger.info(f"Test debate created: {debate_id} from YouTube URL")
    return {"status": "queued", "debate_id": debate_id, "message": "Pipeline started (legacy video). Check status on the events page."}


@app.post("/api/test-hansard")
async def create_test_hansard_debate(
    request: TestHansardRequest,
    _api_key: str = Depends(verify_api_key),
):
    """Test the Hansard-first pipeline for a specific sitting date.

    Creates a debate record for the given date and triggers:
    scrape_hansard -> process -> summarize -> publish.

    No video download or Whisper — uses the official Hansard transcript directly.
    """
    from app.tasks.poll_task import trigger_debate_pipeline

    # Validate date format
    try:
        sitting_date = date.fromisoformat(request.sitting_date.strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    supabase = get_supabase()

    # Get legislature CA
    leg = supabase.table("legislatures").select("id").eq("code", "CA").single().execute()
    if not leg.data:
        raise HTTPException(status_code=500, detail="Legislature CA not found")

    legislature_id = leg.data["id"]
    date_str = sitting_date.isoformat()
    external_id = f"test-hansard-{date_str}-{int(time.time() * 1000)}"

    title = request.title or f"House of Commons Debate — {date_str}"

    hansard_url = f"https://www.ourcommons.ca/DocumentViewer/en/house/{date_str}/hansard"

    row = {
        "legislature_id": legislature_id,
        "external_id": external_id,
        "title": title,
        "date": date_str,
        "session_type": "house",
        "status": "detected",
        "hansard_url": hansard_url,
        "source_urls": [
            {"type": "hansard", "url": hansard_url, "label": "Official Hansard"},
        ],
        "metadata": {
            "source": "test-hansard",
            "scrape_method": "hansard-first",
        },
    }

    result = supabase.table("debates").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create debate")

    debate_id = result.data[0]["id"]
    trigger_debate_pipeline(debate_id, from_stage="detected", hansard_first=True)

    logger.info(f"Test Hansard debate created: {debate_id} for {date_str}")
    return {
        "status": "queued",
        "debate_id": debate_id,
        "sitting_date": date_str,
        "message": "Hansard-first pipeline started. Check status on the events page.",
    }
