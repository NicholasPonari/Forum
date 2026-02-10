"""Post renderer: generates HTML forum posts from debate data using Jinja2 templates."""

import logging
import os
from typing import Any

from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

# Template directory
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "templates")

# Jinja2 environment
_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=True,
)


SESSION_TYPE_LABELS = {
    "house": "House Debate",
    "committee": "Committee Meeting",
    "question_period": "Question Period",
    "emergency": "Emergency Debate",
    "other": "Parliamentary Session",
}


def render_debate_post(
    debate: dict[str, Any],
    en_summary: dict[str, Any],
    fr_summary: dict[str, Any] | None,
    votes: list[dict[str, Any]],
    debate_topics: list[dict[str, Any]] | None = None,
    contributions: list[dict[str, Any]] | None = None,
) -> str:
    """Render a debate into an HTML forum post.

    Args:
        debate: Debate record with legislatures join.
        en_summary: English summary record.
        fr_summary: French summary record (optional).
        votes: Vote records.
        debate_topics: Topic sections from Hansard scrape (optional).
        contributions: Speaker contributions for key quotes (optional).

    Returns:
        Rendered HTML string.
    """
    legislature = debate.get("legislatures", {})

    # Format duration
    duration_seconds = debate.get("duration_seconds")
    duration_formatted = None
    if duration_seconds:
        hours = duration_seconds // 3600
        minutes = (duration_seconds % 3600) // 60
        if hours > 0:
            duration_formatted = f"{hours}h {minutes}m"
        else:
            duration_formatted = f"{minutes} minutes"

    # Format date
    debate_date = debate.get("date", "")
    try:
        from datetime import datetime
        dt = datetime.strptime(str(debate_date), "%Y-%m-%d")
        date_formatted = dt.strftime("%B %d, %Y")
    except (ValueError, TypeError):
        date_formatted = str(debate_date)

    # Format summary text: convert newlines to paragraphs
    summary_text = en_summary.get("summary_text", "") if en_summary else ""
    summary_html = _text_to_html_paragraphs(summary_text)

    # FR summary text
    fr_summary_text = None
    if fr_summary:
        fr_summary_text = _text_to_html_paragraphs(fr_summary.get("summary_text", ""))

    # Prepare debate topics for template
    topic_sections = []
    if debate_topics:
        for topic in debate_topics:
            topic_sections.append({
                "title": topic.get("topic_title", ""),
                "section": topic.get("section", ""),
                "speech_count": topic.get("speech_count", 0),
                "speaker_count": topic.get("speaker_count", 0),
                "parties": topic.get("parties_involved", []),
            })

    # Prepare key quotes from contributions (pick diverse, substantive quotes)
    key_quotes = _select_key_quotes(contributions or [])

    # Render template
    template = _env.get_template("debate_post.html")
    html = template.render(
        legislature_name=legislature.get("name", "Parliament"),
        legislature_code=legislature.get("code", ""),
        session_type_label=SESSION_TYPE_LABELS.get(debate.get("session_type", ""), "Session"),
        date_formatted=date_formatted,
        duration_formatted=duration_formatted,
        summary_html=summary_html,
        key_participants=en_summary.get("key_participants", []) if en_summary else [],
        key_issues=en_summary.get("key_issues", []) if en_summary else [],
        outcome_text=en_summary.get("outcome_text") if en_summary else None,
        votes=votes,
        topic_sections=topic_sections,
        key_quotes=key_quotes,
        fr_summary=fr_summary_text,
        hansard_url=debate.get("hansard_url"),
        video_url=debate.get("video_url"),
        source_urls=debate.get("source_urls", []),
    )

    return html


def build_post_title(debate: dict[str, Any]) -> str:
    """Build the forum post title for a debate.

    Format: [DEBATE] [CODE] Topic/Bill - Short label
    """
    legislature = debate.get("legislatures", {})
    code = legislature.get("code", "??")
    title = debate.get("title", "Parliamentary Debate")

    # Clean up title - remove date if already in title
    debate_date = str(debate.get("date", ""))
    title = title.replace(f" - {debate_date}", "").strip()

    return f"[DEBATE] [{code}] {title}"


def _select_key_quotes(contributions: list[dict[str, Any]], max_quotes: int = 6) -> list[dict]:
    """Select diverse, substantive quotes from contributions.

    Picks one quote per unique speaker/party combo, preferring longer speeches.
    """
    if not contributions:
        return []

    # Score and rank contributions by substance
    scored = []
    for c in contributions:
        text = c.get("text", "")
        if len(text) < 50:  # Skip very short procedural statements
            continue

        metadata = c.get("metadata") or {}
        scored.append({
            "speaker_name": c.get("speaker_name", "Unknown"),
            "party": metadata.get("party", ""),
            "riding": metadata.get("riding", ""),
            "section": metadata.get("section", ""),
            "text": text[:300] + ("..." if len(text) > 300 else ""),
            "length": len(text),
        })

    # Sort by text length (longer = more substantive)
    scored.sort(key=lambda x: -x["length"])

    # Pick diverse quotes (one per speaker, mix of parties)
    selected = []
    seen_speakers = set()
    seen_parties = set()

    # First pass: one per party
    for quote in scored:
        party = quote["party"]
        speaker = quote["speaker_name"]
        if party and party not in seen_parties and speaker not in seen_speakers:
            selected.append(quote)
            seen_speakers.add(speaker)
            seen_parties.add(party)
            if len(selected) >= max_quotes:
                break

    # Second pass: fill remaining slots with other speakers
    if len(selected) < max_quotes:
        for quote in scored:
            if quote["speaker_name"] not in seen_speakers:
                selected.append(quote)
                seen_speakers.add(quote["speaker_name"])
                if len(selected) >= max_quotes:
                    break

    return selected


def _text_to_html_paragraphs(text: str) -> str:
    """Convert plain text with newlines to HTML paragraphs."""
    if not text:
        return ""

    paragraphs = text.strip().split("\n\n")
    if len(paragraphs) == 1:
        # Try single newlines
        paragraphs = text.strip().split("\n")

    html_parts = []
    for p in paragraphs:
        p = p.strip()
        if p:
            html_parts.append(f"<p>{p}</p>")

    return "\n".join(html_parts)
