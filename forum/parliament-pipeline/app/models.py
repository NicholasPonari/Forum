"""Pydantic models for the API and internal data transfer."""

from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class PollRequest(BaseModel):
    """Request to trigger polling for a specific legislature or all."""
    legislature_code: Optional[str] = None  # 'CA', 'ON', 'QC', or None for all


class PollResult(BaseModel):
    """Result from polling a single source."""
    legislature_code: str
    debates_found: int
    debates_new: int
    errors: list[str] = []


class DebateInfo(BaseModel):
    """Basic debate information returned by the API."""
    id: str
    legislature_code: str
    title: str
    date: date
    session_type: str
    status: str
    duration_seconds: Optional[int] = None
    created_at: datetime


class PipelineStatus(BaseModel):
    """Overall pipeline status."""
    total_debates: int
    by_status: dict[str, int]
    recent_errors: list[dict]
    last_poll_at: Optional[datetime] = None


class RetriggerRequest(BaseModel):
    """Request to re-trigger processing for a debate."""
    debate_id: str
    from_stage: str = "detected"  # Reset to this status and reprocess
    hansard_first: bool = True     # Use Hansard-first pipeline (default for federal)


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    redis_connected: bool = False
    supabase_connected: bool = False


class TestDebateRequest(BaseModel):
    """Request to create a test debate from a YouTube URL."""
    youtube_url: str
    title: Optional[str] = None


class TestHansardRequest(BaseModel):
    """Request to test the Hansard-first pipeline for a specific sitting date."""
    sitting_date: str   # YYYY-MM-DD
    title: Optional[str] = None
