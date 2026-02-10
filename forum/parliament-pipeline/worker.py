#!/usr/bin/env python3
"""Celery worker entry point for Railway."""

import os
import sys
import logging

# Configure basic logging to see startup errors
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

try:
    # Add the app directory to Python path
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    logger.info("Python path updated")
    
    logger.info("Importing celery app...")
    from app.celery_app import celery
    logger.info("Celery app imported successfully")
    
    if __name__ == "__main__":
        logger.info("Starting Celery worker...")
        # Start the Celery worker with all pipeline queues
        celery.start([
            "worker", 
            "--loglevel=info", 
            "--concurrency=2",
            "--queues=celery,polling,processing,ingestion,transcription,summarization,publishing"
        ])
except Exception as e:
    logger.error(f"Worker startup failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
