"""Speaker mapper: aligns Whisper transcript segments with Hansard speaker data.

Combines multiple signals:
1. Hansard speaker names and intervention order
2. Whisper segment text similarity
3. Speaker database for canonical names
"""

import logging
import re
from typing import Any

from unidecode import unidecode

from app.utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def map_speakers(
    transcripts: list[dict[str, Any]],
    hansard_data: dict[str, Any],
    legislature: dict[str, Any],
) -> dict[str, str]:
    """Map Whisper transcript segments to speaker identities.

    Strategy:
    1. If Hansard is available, use intervention order to align speakers
    2. Match transcript text to Hansard interventions via fuzzy matching
    3. Ensure all speakers are in the debate_speakers table

    Args:
        transcripts: List of transcript records from the database.
        hansard_data: Parsed Hansard data from hansard_parser.
        legislature: Legislature record.

    Returns:
        A mapping of segment index -> speaker_id (UUID).
    """
    supabase = get_supabase()
    legislature_id = legislature["id"]
    speaker_map: dict[str, str] = {}

    if not hansard_data.get("available"):
        logger.info("No Hansard data available; speaker mapping will be limited")
        return speaker_map

    # Step 1: Ensure all Hansard speakers are in the database
    hansard_speakers = hansard_data.get("speakers", [])
    speaker_name_to_id: dict[str, str] = {}

    for hs in hansard_speakers:
        speaker_id = _ensure_speaker_in_db(
            supabase=supabase,
            legislature_id=legislature_id,
            name=hs["name"],
            party=hs.get("party", ""),
            role=hs.get("role", ""),
        )
        speaker_name_to_id[hs["name"]] = speaker_id
        # Also map normalized name
        normalized = _normalize_name(hs["name"])
        speaker_name_to_id[normalized] = speaker_id

    # Step 2: Align transcript segments with Hansard interventions
    hansard_interventions = hansard_data.get("interventions", [])

    if not hansard_interventions:
        logger.info("No Hansard interventions to align")
        return speaker_name_to_id

    # Use the primary transcript (first one, usually English)
    primary_transcript = transcripts[0] if transcripts else None
    if not primary_transcript or not primary_transcript.get("segments"):
        return speaker_name_to_id

    segments = primary_transcript["segments"]

    # Step 3: Align by matching transcript text chunks to Hansard text
    intervention_idx = 0
    segment_window = []
    current_speaker = None

    for seg_idx, segment in enumerate(segments):
        seg_text = segment.get("text", "").strip()
        if not seg_text:
            continue

        # Check if this segment's text matches the start of the next intervention
        if intervention_idx < len(hansard_interventions):
            intervention = hansard_interventions[intervention_idx]
            intervention_text = intervention.get("text", "")

            # Check for text overlap
            similarity = _text_similarity(seg_text, intervention_text[:200])

            if similarity > 0.3:
                # This segment corresponds to this intervention
                speaker_name = intervention["speaker_name"]
                if speaker_name in speaker_name_to_id:
                    current_speaker = speaker_name_to_id[speaker_name]
                else:
                    # Try normalized matching
                    normalized = _normalize_name(speaker_name)
                    current_speaker = speaker_name_to_id.get(normalized)

                intervention_idx += 1

            # Also check if the segment text mentions a speaker name
            # (common in transcripts: "Mr. Smith: ...")
            detected_speaker = _detect_speaker_in_text(seg_text, speaker_name_to_id)
            if detected_speaker:
                current_speaker = detected_speaker

        if current_speaker:
            speaker_map[str(seg_idx)] = current_speaker

    logger.info(
        f"Speaker mapping complete: {len(speaker_map)} of {len(segments)} segments mapped "
        f"({len(speaker_name_to_id)} unique speakers)"
    )
    return speaker_map


def _ensure_speaker_in_db(
    supabase,
    legislature_id: str,
    name: str,
    party: str = "",
    role: str = "",
) -> str:
    """Ensure a speaker exists in debate_speakers and return their ID."""
    normalized = _normalize_name(name)

    # Check if speaker already exists
    result = (
        supabase.table("debate_speakers")
        .select("id")
        .eq("legislature_id", legislature_id)
        .eq("name_normalized", normalized)
        .execute()
    )

    if result.data:
        return result.data[0]["id"]

    # Create new speaker
    insert_result = supabase.table("debate_speakers").insert({
        "legislature_id": legislature_id,
        "name": name,
        "name_normalized": normalized,
        "party": party,
        "role": role,
    }).execute()

    speaker_id = insert_result.data[0]["id"]
    logger.info(f"Created speaker: {name} ({party}) -> {speaker_id}")
    return speaker_id


def _normalize_name(name: str) -> str:
    """Normalize a name for matching: lowercase, strip accents, remove titles."""
    # Remove accents
    normalized = unidecode(name)
    # Lowercase
    normalized = normalized.lower().strip()
    # Remove common titles
    normalized = re.sub(
        r'^(the\s+)?(right\s+)?(honourable|hon\.?|mr\.?|mrs\.?|ms\.?|mme\.?|m\.?)\s*',
        '', normalized, flags=re.IGNORECASE
    )
    # Remove extra whitespace
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized


def _text_similarity(text1: str, text2: str) -> float:
    """Simple word-overlap similarity between two texts."""
    if not text1 or not text2:
        return 0.0

    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())

    if not words1 or not words2:
        return 0.0

    intersection = words1 & words2
    union = words1 | words2

    return len(intersection) / len(union)


def _detect_speaker_in_text(text: str, speaker_map: dict[str, str]) -> str | None:
    """Detect if a segment starts with a speaker name pattern."""
    # Common patterns: "Mr. Smith:", "The Speaker:", "Hon. Member:"
    name_pattern = re.match(r'^([A-Z][^:]{2,40}):\s', text)
    if name_pattern:
        spoken_name = name_pattern.group(1).strip()
        normalized = _normalize_name(spoken_name)

        # Try exact match
        if normalized in speaker_map:
            return speaker_map[normalized]

        # Try partial match (last name)
        for known_name, speaker_id in speaker_map.items():
            if normalized in known_name or known_name in normalized:
                return speaker_id

    return None
