"""Media storage management: local filesystem and cleanup utilities."""

import logging
import os
import shutil
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


def get_media_path(debate_id: str, filename: str = "audio.wav") -> str:
    """Get the local file path for a debate's media file."""
    media_dir = Path(settings.media_storage_path) / debate_id
    return str(media_dir / filename)


def media_exists(debate_id: str, filename: str = "audio.wav") -> bool:
    """Check if a media file exists for a debate."""
    path = get_media_path(debate_id, filename)
    return os.path.exists(path)


def cleanup_media(debate_id: str):
    """Clean up all media files for a debate after processing."""
    media_dir = Path(settings.media_storage_path) / debate_id
    if media_dir.exists():
        shutil.rmtree(media_dir)
        logger.info(f"Cleaned up media for debate {debate_id}")


def get_storage_usage() -> dict:
    """Get current media storage usage statistics."""
    storage_path = Path(settings.media_storage_path)
    if not storage_path.exists():
        return {"total_bytes": 0, "debate_count": 0}

    total_bytes = 0
    debate_count = 0

    for debate_dir in storage_path.iterdir():
        if debate_dir.is_dir():
            debate_count += 1
            for f in debate_dir.rglob("*"):
                if f.is_file():
                    total_bytes += f.stat().st_size

    return {
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / (1024 * 1024), 2),
        "debate_count": debate_count,
    }
