"""Forum publisher: inserts debate posts into the Supabase issues table."""

import logging
from typing import Any

from app.config import settings
from app.utils.supabase_client import get_supabase
from app.publishing.post_renderer import build_post_title

logger = logging.getLogger(__name__)

# Legislature code to province mapping for provincial debates
CODE_TO_PROVINCE = {
    "ON": "Ontario",
    "QC": "Quebec",
    "BC": "British Columbia",
    "AB": "Alberta",
}


def publish_to_forum(
    debate: dict[str, Any],
    post_html: str,
    primary_category: dict[str, Any] | None,
) -> str:
    """Publish a debate as a forum issue/post.

    Inserts into the existing `issues` table with:
    - type = 'Debate'
    - Correct government_level based on legislature level
    - Topic from primary category
    - Province for provincial debates

    Args:
        debate: Debate record with legislatures join.
        post_html: Rendered HTML body.
        primary_category: Primary category record (with topic_slug).

    Returns:
        The created issue ID (UUID string).
    """
    supabase = get_supabase()
    legislature = debate.get("legislatures", {})

    # Build title
    title = build_post_title(debate)

    # Determine government level
    government_level = legislature.get("level", "federal")

    # Determine province
    legislature_code = legislature.get("code", "")
    province = CODE_TO_PROVINCE.get(legislature_code) if government_level == "provincial" else None

    # Determine topic
    topic_slug = "general"
    if primary_category:
        topic_slug = primary_category.get("topic_slug", "general")

    # Build issue data
    issue_data = {
        "title": title,
        "narrative": post_html,
        "type": "Debate",
        "topic": topic_slug,
        "government_level": government_level,
        "user_id": settings.system_bot_user_id,
    }

    # Add province for provincial debates
    if province:
        issue_data["province"] = province

    # Add video URL if available
    video_url = debate.get("video_url")
    if video_url:
        issue_data["video_url"] = video_url
        issue_data["media_type"] = "video"

    # Insert into issues table
    result = supabase.table("issues").insert(issue_data).execute()

    if not result.data:
        raise RuntimeError("Failed to insert forum post: no data returned")

    issue_id = result.data[0]["id"]
    logger.info(
        f"Published debate as forum issue {issue_id}: {title} "
        f"(level={government_level}, topic={topic_slug})"
    )

    return str(issue_id)
