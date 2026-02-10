"""Whisper transcription service using faster-whisper.

Provides high-accuracy speech-to-text for parliamentary audio in EN and FR.
Supports VAD-based segmentation for speaker turn detection.
"""

import logging
import time
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# Lazy-loaded model instance
_model = None


def _get_model():
    """Lazy-load the faster-whisper model."""
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        logger.info(
            f"Loading Whisper model: {settings.whisper_model} "
            f"(device={settings.whisper_device}, compute_type={settings.whisper_compute_type})"
        )
        start = time.time()

        _model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )

        elapsed = time.time() - start
        logger.info(f"Whisper model loaded in {elapsed:.1f}s")

    return _model


def transcribe_audio(
    audio_path: str,
    language: str = "en",
    beam_size: int = 5,
    vad_filter: bool = True,
) -> dict[str, Any]:
    """Transcribe an audio file using faster-whisper.

    Args:
        audio_path: Path to the audio file (WAV, 16kHz mono recommended).
        language: Language code ('en' or 'fr').
        beam_size: Beam size for decoding (higher = more accurate but slower).
        vad_filter: Enable Voice Activity Detection to skip silence.

    Returns:
        Dictionary with:
        - raw_text: Full transcript as a single string
        - segments: List of segment dicts with start, end, text, confidence
        - model: Model name used
        - avg_confidence: Average segment confidence
        - word_count: Total word count
        - processing_time_seconds: Time taken
    """
    model = _get_model()
    start_time = time.time()

    logger.info(f"Starting transcription: {audio_path} (lang={language})")

    # Configure VAD parameters for parliamentary audio
    vad_parameters = None
    if vad_filter:
        vad_parameters = {
            "threshold": 0.5,
            "min_speech_duration_ms": 250,
            "min_silence_duration_ms": 500,
            "speech_pad_ms": 300,
        }

    # Run transcription
    segments_iter, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=beam_size,
        vad_filter=vad_filter,
        vad_parameters=vad_parameters,
        word_timestamps=True,
        condition_on_previous_text=True,
        initial_prompt=_get_initial_prompt(language),
    )

    # Collect segments
    segments = []
    raw_text_parts = []
    total_confidence = 0.0
    total_words = 0

    for segment in segments_iter:
        seg_dict = {
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
            "text": segment.text.strip(),
            "confidence": round(segment.avg_logprob, 4) if segment.avg_logprob else None,
            "no_speech_prob": round(segment.no_speech_prob, 4) if segment.no_speech_prob else None,
        }

        # Include word-level timestamps if available
        if segment.words:
            seg_dict["words"] = [
                {
                    "word": w.word,
                    "start": round(w.start, 2),
                    "end": round(w.end, 2),
                    "probability": round(w.probability, 4),
                }
                for w in segment.words
            ]

        segments.append(seg_dict)
        raw_text_parts.append(segment.text.strip())

        if segment.avg_logprob:
            total_confidence += segment.avg_logprob
        total_words += len(segment.text.split())

    processing_time = int(time.time() - start_time)
    avg_confidence = total_confidence / len(segments) if segments else 0.0

    logger.info(
        f"Transcription complete: {len(segments)} segments, "
        f"{total_words} words, {processing_time}s "
        f"(detected lang: {info.language}, prob: {info.language_probability:.2f})"
    )

    return {
        "raw_text": " ".join(raw_text_parts),
        "segments": segments,
        "model": settings.whisper_model,
        "avg_confidence": round(avg_confidence, 4),
        "word_count": total_words,
        "processing_time_seconds": processing_time,
        "detected_language": info.language,
        "language_probability": round(info.language_probability, 4),
        "audio_duration": round(info.duration, 2) if info.duration else None,
    }


def _get_initial_prompt(language: str) -> str:
    """Get an initial prompt to guide Whisper for parliamentary context.

    This helps Whisper recognize parliamentary terminology and speaker patterns.
    """
    if language == "fr":
        return (
            "Débat parlementaire. Assemblée nationale. Chambre des communes. "
            "Le Président, Monsieur le Premier Ministre, l'honorable député. "
            "Projet de loi, motion, amendement, vote par appel nominal. "
            "Période des questions orales."
        )
    else:
        return (
            "Parliamentary debate. House of Commons. Legislative Assembly. "
            "The Speaker, the Right Honourable Prime Minister, the honourable member. "
            "Bill, motion, amendment, recorded division. "
            "Oral Question Period. Order, order."
        )


def is_model_loaded() -> bool:
    """Check if the Whisper model is currently loaded."""
    return _model is not None
