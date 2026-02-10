#!/usr/bin/env python3
"""Celery worker entry point for Railway."""

import os
import sys

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.celery_app import celery

if __name__ == "__main__":
    # Start the Celery worker with all pipeline queues
    celery.start([
        "worker", 
        "--loglevel=info", 
        "--concurrency=2",
        "--queues=celery,polling,processing,ingestion,transcription,summarization,publishing"
    ])
