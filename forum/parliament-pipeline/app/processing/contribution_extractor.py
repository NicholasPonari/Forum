"""Contribution extractor: segments transcripts into individual speaker contributions.

Creates debate_contributions records with timing, text, and speaker linkage.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def extract_contributions(
    transcripts: list[dict[str, Any]],
    speaker_mappings: dict[str, str],
    debate_id: str,
) -> list[dict[str, Any]]:
    """Extract individual speaker contributions from transcripts.

    Groups consecutive segments by the same speaker into single contributions.

    Args:
        transcripts: Transcript records with segments.
        speaker_mappings: Mapping of segment_idx -> speaker_id.
        debate_id: The debate ID.

    Returns:
        List of contribution dicts ready for database insertion.
    """
    contributions = []

    # Use primary transcript
    primary_transcript = transcripts[0] if transcripts else None
    if not primary_transcript:
        return contributions

    segments = primary_transcript.get("segments", [])
    language = primary_transcript.get("language", "en")

    if not segments:
        return contributions

    # Group consecutive segments by speaker
    current_speaker_id = None
    current_speaker_raw = None
    current_segments: list[dict] = []
    sequence_order = 0

    for seg_idx, segment in enumerate(segments):
        seg_speaker_id = speaker_mappings.get(str(seg_idx))

        if seg_speaker_id != current_speaker_id and current_segments:
            # Flush current contribution
            contribution = _build_contribution(
                debate_id=debate_id,
                speaker_id=current_speaker_id,
                speaker_name_raw=current_speaker_raw,
                segments=current_segments,
                language=language,
                sequence_order=sequence_order,
            )
            if contribution:
                contributions.append(contribution)
                sequence_order += 1

            current_segments = []

        current_speaker_id = seg_speaker_id
        current_speaker_raw = _extract_speaker_name_from_segment(segment)
        current_segments.append(segment)

    # Flush final contribution
    if current_segments:
        contribution = _build_contribution(
            debate_id=debate_id,
            speaker_id=current_speaker_id,
            speaker_name_raw=current_speaker_raw,
            segments=current_segments,
            language=language,
            sequence_order=sequence_order,
        )
        if contribution:
            contributions.append(contribution)

    # Also handle secondary language transcript (e.g., French for federal)
    if len(transcripts) > 1:
        fr_transcript = transcripts[1]
        fr_contributions = _extract_secondary_language_text(
            contributions=contributions,
            secondary_transcript=fr_transcript,
        )
        contributions = fr_contributions

    logger.info(f"Extracted {len(contributions)} contributions from {len(segments)} segments")
    return contributions


def _build_contribution(
    debate_id: str,
    speaker_id: str | None,
    speaker_name_raw: str | None,
    segments: list[dict],
    language: str,
    sequence_order: int,
) -> dict | None:
    """Build a contribution dict from a group of segments."""
    if not segments:
        return None

    text_parts = [s.get("text", "").strip() for s in segments if s.get("text")]
    if not text_parts:
        return None

    full_text = " ".join(text_parts)

    # Skip very short contributions (likely noise)
    if len(full_text.split()) < 3:
        return None

    start_time = segments[0].get("start", 0)
    end_time = segments[-1].get("end", 0)

    contribution = {
        "debate_id": debate_id,
        "speaker_id": speaker_id,
        "speaker_name_raw": speaker_name_raw,
        "start_time_seconds": round(start_time, 2),
        "end_time_seconds": round(end_time, 2),
        "text": full_text,
        "language": language,
        "sequence_order": sequence_order,
    }

    return contribution


def _extract_speaker_name_from_segment(segment: dict) -> str | None:
    """Try to extract a speaker name from a segment's text."""
    import re
    text = segment.get("text", "")
    # Common patterns: "Mr. Smith:", "The Speaker:"
    match = re.match(r'^([A-Z][^:]{2,40}):\s', text)
    if match:
        return match.group(1).strip()
    return None


def _extract_secondary_language_text(
    contributions: list[dict],
    secondary_transcript: dict,
) -> list[dict]:
    """Align secondary language transcript segments with existing contributions.

    This does approximate alignment based on time ranges.
    """
    secondary_segments = secondary_transcript.get("segments", [])
    secondary_language = secondary_transcript.get("language", "fr")

    if not secondary_segments:
        return contributions

    for contribution in contributions:
        start = contribution.get("start_time_seconds", 0)
        end = contribution.get("end_time_seconds", 0)

        # Find overlapping secondary segments
        fr_parts = []
        for seg in secondary_segments:
            seg_start = seg.get("start", 0)
            seg_end = seg.get("end", 0)

            # Check for overlap
            if seg_start < end and seg_end > start:
                fr_parts.append(seg.get("text", "").strip())

        if fr_parts:
            contribution["text_fr"] = " ".join(fr_parts)

    return contributions
