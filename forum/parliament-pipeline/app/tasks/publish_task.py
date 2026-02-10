"""Publishing task: create forum post from processed debate data."""

import logging
from app.celery_app import celery
from app.utils.retry import update_debate_status, mark_debate_error
from app.publishing.post_renderer import render_debate_post
from app.publishing.forum_publisher import publish_to_forum
from app.utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


@celery.task(
    name="app.tasks.publish_task.publish_debate",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def publish_debate(self, debate_id: str) -> str:
    """Render and publish a debate as a forum post.

    Returns the debate_id for chain completion.
    """
    logger.info(f"Publishing debate: {debate_id}")
    update_debate_status(debate_id, "publishing")

    try:
        supabase = get_supabase()

        # Gather all data needed for the post
        debate_result = (
            supabase.table("debates")
            .select("*, legislatures(*)")
            .eq("id", debate_id)
            .single()
            .execute()
        )
        debate = debate_result.data

        # Get EN summary (primary post language)
        summary_result = (
            supabase.table("debate_summaries")
            .select("*")
            .eq("debate_id", debate_id)
            .eq("language", "en")
            .single()
            .execute()
        )
        en_summary = summary_result.data

        # Get FR summary for bilingual section
        fr_summary_result = (
            supabase.table("debate_summaries")
            .select("*")
            .eq("debate_id", debate_id)
            .eq("language", "fr")
            .maybeSingle()
            .execute()
        )
        fr_summary = fr_summary_result.data if fr_summary_result.data else None

        # Get primary category
        cat_result = (
            supabase.table("debate_categories")
            .select("*")
            .eq("debate_id", debate_id)
            .eq("is_primary", True)
            .limit(1)
            .execute()
        )
        primary_category = cat_result.data[0] if cat_result.data else None

        # Get votes
        votes_result = (
            supabase.table("debate_votes")
            .select("*")
            .eq("debate_id", debate_id)
            .execute()
        )
        votes = votes_result.data or []

        # Get debate topics (from Hansard scrape)
        topics_result = (
            supabase.table("debate_topics")
            .select("*")
            .eq("debate_id", debate_id)
            .order("sequence_order")
            .execute()
        )
        debate_topics = topics_result.data or []

        # Get top contributions for key quotes
        contrib_result = (
            supabase.table("debate_contributions")
            .select("*")
            .eq("debate_id", debate_id)
            .order("sequence_order")
            .limit(100)
            .execute()
        )
        contributions = contrib_result.data or []

        # Render the HTML post
        post_html = render_debate_post(
            debate=debate,
            en_summary=en_summary,
            fr_summary=fr_summary,
            votes=votes,
            debate_topics=debate_topics,
            contributions=contributions,
        )

        # Publish to forum
        issue_id = publish_to_forum(
            debate=debate,
            post_html=post_html,
            primary_category=primary_category,
        )

        # Track the forum post
        supabase.table("debate_forum_posts").insert({
            "debate_id": debate_id,
            "issue_id": issue_id,
            "status": "created",
            "post_html": post_html,
        }).execute()

        # Mark debate as published
        update_debate_status(debate_id, "published")
        logger.info(f"Debate {debate_id} published as forum issue {issue_id}")
        return debate_id

    except Exception as e:
        logger.error(f"Publishing failed for {debate_id}: {e}")
        can_retry = mark_debate_error(debate_id, str(e))
        if can_retry:
            raise self.retry(exc=e)
        raise
