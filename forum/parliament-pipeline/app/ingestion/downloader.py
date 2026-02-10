"""Media downloader: fetches audio/video from parliamentary sources.

Supports:
- Direct HTTP downloads (MP4, MP3, WAV)
- HLS streams (ParlVU, legislature portals) via ffmpeg
- YouTube fallback via yt-dlp
"""

import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def download_media(debate: dict[str, Any], legislature: dict[str, Any]) -> dict[str, Any]:
    """Download media for a debate, extracting audio for transcription.

    Tries sources in order:
    1. Official portal video/audio (direct download or HLS)
    2. YouTube fallback (via yt-dlp)

    Returns a media info dict with:
    - media_type: 'audio'
    - source: source name
    - original_url: where it came from
    - local_path: path to the downloaded audio file
    - file_size_bytes: size
    - duration_seconds: duration
    - language: detected or expected language
    """
    debate_id = debate["id"]
    legislature_code = legislature["code"]

    # Ensure media storage directory exists
    media_dir = Path(settings.media_storage_path) / debate_id
    media_dir.mkdir(parents=True, exist_ok=True)

    output_path = str(media_dir / "audio.wav")

    # Try official sources first
    video_url = debate.get("video_url")
    source_urls = debate.get("source_urls", [])

    # Collect all candidate URLs (video sources first)
    candidate_urls = []
    if video_url:
        candidate_urls.append(("primary", video_url))
    for src in source_urls:
        if src.get("type") == "video" and src.get("url"):
            candidate_urls.append((src.get("label", "source"), src["url"]))

    for source_name, url in candidate_urls:
        try:
            result = _download_from_url(url, output_path, source_name)
            if result:
                result["language"] = _infer_language(legislature_code)
                return result
        except Exception as e:
            logger.warning(f"Download from {source_name} ({url}) failed: {e}")
            continue

    # YouTube fallback
    youtube_url = _find_youtube_url(debate, legislature)
    if youtube_url:
        try:
            result = _download_from_youtube(youtube_url, output_path)
            if result:
                result["language"] = _infer_language(legislature_code)
                return result
        except Exception as e:
            logger.warning(f"YouTube download failed: {e}")

    raise RuntimeError(f"No media source available for debate {debate_id}")


def _download_from_url(url: str, output_path: str, source_name: str) -> dict | None:
    """Download media from a direct URL or HLS stream."""

    # Detect HLS streams
    if ".m3u8" in url or "manifest" in url.lower():
        return _download_hls(url, output_path, source_name)

    # Try direct download
    return _download_direct(url, output_path, source_name)


def _download_direct(url: str, output_path: str, source_name: str) -> dict | None:
    """Download a direct media file and extract audio."""
    logger.info(f"Direct download from {source_name}: {url}")

    # Download the file
    temp_path = output_path.replace(".wav", ".tmp")

    with httpx.Client(timeout=600, follow_redirects=True) as client:
        with client.stream("GET", url, headers={
            "User-Agent": "Vox.Vote Parliament Tracker/1.0",
        }) as response:
            response.raise_for_status()
            total_size = 0
            with open(temp_path, "wb") as f:
                for chunk in response.iter_bytes(chunk_size=8192):
                    f.write(chunk)
                    total_size += len(chunk)

    logger.info(f"Downloaded {total_size} bytes from {source_name}")

    # Extract audio using ffmpeg
    _extract_audio(temp_path, output_path)

    # Get duration
    duration = _get_duration(output_path)

    # Clean up temp file
    if os.path.exists(temp_path) and temp_path != output_path:
        os.remove(temp_path)

    file_size = os.path.getsize(output_path)

    return {
        "media_type": "audio",
        "source": source_name,
        "original_url": url,
        "local_path": output_path,
        "file_size_bytes": file_size,
        "duration_seconds": duration,
    }


def _download_hls(url: str, output_path: str, source_name: str) -> dict | None:
    """Download an HLS stream and convert to audio."""
    logger.info(f"HLS download from {source_name}: {url}")

    try:
        # Use ffmpeg to download HLS stream and extract audio
        cmd = [
            "ffmpeg", "-y",
            "-i", url,
            "-vn",  # No video
            "-acodec", "pcm_s16le",  # WAV format
            "-ar", "16000",  # 16kHz sample rate (optimal for Whisper)
            "-ac", "1",  # Mono
            output_path,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=3600,  # 1 hour timeout
        )

        if result.returncode != 0:
            logger.error(f"ffmpeg HLS download failed: {result.stderr[:500]}")
            return None

        duration = _get_duration(output_path)
        file_size = os.path.getsize(output_path)

        return {
            "media_type": "audio",
            "source": source_name,
            "original_url": url,
            "local_path": output_path,
            "file_size_bytes": file_size,
            "duration_seconds": duration,
        }

    except subprocess.TimeoutExpired:
        logger.error(f"HLS download timed out for {url}")
        return None
    except FileNotFoundError:
        logger.error("ffmpeg not found. Please install ffmpeg.")
        raise


def _download_from_youtube(url: str, output_path: str) -> dict | None:
    """Download audio from YouTube using yt-dlp."""
    logger.info(f"YouTube download: {url}")

    try:
        cmd = [
            "yt-dlp",
            "--extract-audio",
            "--audio-format", "wav",
            "--audio-quality", "0",
            "--postprocessor-args", "ffmpeg:-ar 16000 -ac 1",
            "-o", output_path.replace(".wav", ".%(ext)s"),
            url,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=3600,
        )

        if result.returncode != 0:
            logger.error(f"yt-dlp failed: {result.stderr[:500]}")
            return None

        # yt-dlp may produce a slightly different filename
        if not os.path.exists(output_path):
            # Look for the output file
            output_dir = os.path.dirname(output_path)
            for f in os.listdir(output_dir):
                if f.endswith(".wav"):
                    actual_path = os.path.join(output_dir, f)
                    if actual_path != output_path:
                        os.rename(actual_path, output_path)
                    break

        if not os.path.exists(output_path):
            logger.error("yt-dlp did not produce expected output file")
            return None

        duration = _get_duration(output_path)
        file_size = os.path.getsize(output_path)

        return {
            "media_type": "audio",
            "source": "youtube",
            "original_url": url,
            "local_path": output_path,
            "file_size_bytes": file_size,
            "duration_seconds": duration,
        }

    except subprocess.TimeoutExpired:
        logger.error("YouTube download timed out")
        return None
    except FileNotFoundError:
        logger.error("yt-dlp not found. Please install yt-dlp.")
        raise


def _extract_audio(input_path: str, output_path: str):
    """Extract audio from a media file using ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vn",  # No video
        "-acodec", "pcm_s16le",
        "-ar", "16000",  # 16kHz for Whisper
        "-ac", "1",  # Mono
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extraction failed: {result.stderr[:500]}")


def _get_duration(audio_path: str) -> int | None:
    """Get the duration of an audio file in seconds."""
    try:
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip():
            return int(float(result.stdout.strip()))
    except Exception:
        pass
    return None


def _find_youtube_url(debate: dict, legislature: dict) -> str | None:
    """Try to find a YouTube URL for the debate as a fallback."""
    # Check metadata for YouTube links
    metadata = debate.get("metadata", {})
    if metadata.get("youtube_url"):
        return metadata["youtube_url"]

    # Check source_urls
    for src in debate.get("source_urls", []):
        url = src.get("url", "")
        if "youtube.com" in url or "youtu.be" in url:
            return url

    # Could search YouTube channels, but that's a V2 feature
    return None


def _infer_language(legislature_code: str) -> str:
    """Infer the primary language of a legislature's proceedings."""
    return {
        "CA": "en+fr",  # Federal is bilingual
        "ON": "en",
        "QC": "fr",
    }.get(legislature_code, "en")
