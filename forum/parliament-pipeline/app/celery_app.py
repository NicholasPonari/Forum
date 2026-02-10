"""Celery application configuration."""

from celery import Celery
from app.config import settings

celery = Celery(
    "parliament_pipeline",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Retry settings
    task_default_retry_delay=30,
    task_max_retries=settings.max_retries,
    # Task routes
    task_routes={
        "app.tasks.poll_task.*": {"queue": "polling"},
        "app.tasks.ingest_task.*": {"queue": "ingestion"},
        "app.tasks.transcribe_task.*": {"queue": "transcription"},
        "app.tasks.process_task.*": {"queue": "processing"},
        "app.tasks.summarize_task.*": {"queue": "summarization"},
        "app.tasks.publish_task.*": {"queue": "publishing"},
    },
    # Beat schedule (optional local scheduling; Vercel cron is primary)
    beat_schedule={
        "poll-all-sources": {
            "task": "app.tasks.poll_task.poll_all_sources",
            "schedule": settings.poll_interval_minutes * 60,
        },
    },
)

# Auto-discover tasks in the tasks package
celery.autodiscover_tasks(["app"])
