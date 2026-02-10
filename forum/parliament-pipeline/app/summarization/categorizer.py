"""Debate categorizer: maps debates to forum topic slugs using LLM + rules.

Assigns one or more TopicId slugs from the forum's topic system:
general, healthcare, economy, housing, climate, education, transit,
immigration, indigenous, defense, justice, childcare, accessibility, budget, other
"""

import json
import logging
from typing import Any

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

# Valid topic slugs matching forum/src/lib/topics.ts TopicId
VALID_TOPICS = [
    "general", "healthcare", "economy", "housing", "climate", "education",
    "transit", "immigration", "indigenous", "defense", "justice",
    "childcare", "accessibility", "budget", "other",
]

# Keyword-based pre-classification (for quick rules-based categorization)
KEYWORD_MAP: dict[str, list[str]] = {
    "healthcare": ["health", "hospital", "doctor", "nurse", "medical", "pharmaceutical", "drug", "patient",
                    "santé", "hôpital", "médecin", "infirmière"],
    "economy": ["economy", "jobs", "employment", "business", "trade", "tariff", "GDP", "inflation",
                "économie", "emploi", "commerce", "entreprise"],
    "housing": ["housing", "rent", "mortgage", "affordable", "homeless", "shelter",
                "logement", "loyer", "hypothèque", "abordable", "itinérant"],
    "climate": ["climate", "environment", "carbon", "emission", "pollution", "green", "renewable", "energy",
                "climat", "environnement", "carbone", "émission", "énergie"],
    "education": ["education", "school", "university", "student", "teacher", "tuition",
                  "éducation", "école", "université", "étudiant", "enseignant"],
    "transit": ["transit", "transport", "infrastructure", "highway", "road", "bridge", "rail",
                "transport", "autoroute", "route", "pont", "ferroviaire"],
    "immigration": ["immigration", "refugee", "asylum", "visa", "citizenship", "border",
                    "immigration", "réfugié", "asile", "visa", "citoyenneté", "frontière"],
    "indigenous": ["indigenous", "first nations", "aboriginal", "treaty", "reconciliation",
                   "autochtone", "premières nations", "traité", "réconciliation"],
    "defense": ["defense", "military", "security", "nato", "armed forces", "terrorism",
                "défense", "militaire", "sécurité", "otan", "forces armées", "terrorisme"],
    "justice": ["justice", "law", "court", "crime", "police", "prison", "criminal",
                "justice", "loi", "tribunal", "crime", "police", "prison"],
    "childcare": ["childcare", "child care", "daycare", "parental", "family", "children",
                  "garde d'enfants", "garderie", "parental", "famille", "enfants"],
    "accessibility": ["accessibility", "disability", "disabled", "accommodation",
                      "accessibilité", "handicap", "invalidité"],
    "budget": ["budget", "tax", "fiscal", "spending", "deficit", "debt", "revenue",
               "budget", "impôt", "fiscal", "dépenses", "déficit", "dette", "revenus"],
}


def categorize_debate(
    debate: dict[str, Any],
    transcripts: list[dict[str, Any]],
    en_summary: dict[str, Any],
    contributions: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Categorize a debate into forum topic categories.

    Uses a hybrid approach:
    1. Rules-based keyword matching for high-confidence categories
    2. LLM classification for nuanced categorization

    Returns:
        List of category dicts with topic_slug, confidence, is_primary.
    """
    # Step 1: Keyword-based pre-classification
    keyword_scores = _keyword_classify(transcripts, en_summary, contributions)

    # Step 2: LLM-based classification
    llm_categories = _llm_classify(debate, en_summary)

    # Step 3: Merge and rank
    categories = _merge_classifications(keyword_scores, llm_categories)

    logger.info(
        f"Categorized debate {debate['id']}: "
        f"{[c['topic_slug'] for c in categories]}"
    )
    return categories


def _keyword_classify(
    transcripts: list[dict],
    en_summary: dict,
    contributions: list[dict] | None = None,
) -> dict[str, float]:
    """Score topics based on keyword frequency in transcript/contributions and summary."""
    # Build text corpus
    text = en_summary.get("summary_text", "").lower()
    for t in transcripts:
        raw = t.get("raw_text", "")
        text += " " + raw[:20_000].lower()

    # For Hansard-first debates, use contribution text as source
    if contributions:
        for c in contributions[:100]:
            contrib_text = c.get("text", "")
            text += " " + contrib_text[:500].lower()

    scores: dict[str, float] = {}

    for topic, keywords in KEYWORD_MAP.items():
        count = 0
        for keyword in keywords:
            count += text.count(keyword.lower())

        if count > 0:
            # Normalize: log-scale to dampen very frequent terms
            import math
            scores[topic] = min(1.0, math.log(1 + count) / 5.0)

    return scores


def _llm_classify(debate: dict, en_summary: dict) -> list[dict[str, Any]]:
    """Use LLM to classify the debate into topics."""
    if not settings.openai_api_key:
        logger.warning("No OpenAI API key; skipping LLM classification")
        return []

    client = OpenAI(api_key=settings.openai_api_key)

    summary_text = en_summary.get("summary_text", "")
    key_issues = en_summary.get("key_issues", [])
    issues_text = "\n".join(
        f"- {i.get('issue', '')}: {i.get('description', '')}" for i in key_issues
    )

    prompt = f"""Classify this parliamentary debate into one or more topic categories.

Available categories (use these exact slugs):
- general: General topics not fitting other categories
- healthcare: Health, hospitals, medical policy
- economy: Economy, jobs, trade, business
- housing: Housing, affordability, homelessness
- climate: Climate, environment, energy
- education: Education, schools, universities
- transit: Transit, infrastructure, transportation
- immigration: Immigration, refugees, borders
- indigenous: Indigenous affairs, reconciliation
- defense: Defense, military, security
- justice: Justice, law, courts, policing
- childcare: Childcare, families, parental leave
- accessibility: Accessibility, disability rights
- budget: Budget, taxation, fiscal policy
- other: Other topics

Debate: {debate.get('title', '')}
Date: {debate.get('date', '')}

Summary: {summary_text[:2000]}

Key Issues:
{issues_text}

Respond with a JSON object:
{{
  "categories": [
    {{"topic_slug": "slug", "confidence": 0.0-1.0, "reason": "brief reason"}}
  ]
}}

Rules:
- Return 1-3 categories, ordered by relevance.
- The first category should be the primary/most relevant one.
- Confidence should reflect how strongly the debate relates to the topic.
- Use "general" only if no other category fits well."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a parliamentary debate classifier. Respond with JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=500,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        categories = result.get("categories", [])

        # Validate topic slugs
        valid_categories = []
        for cat in categories:
            slug = cat.get("topic_slug", "")
            if slug in VALID_TOPICS:
                valid_categories.append({
                    "topic_slug": slug,
                    "confidence": min(1.0, max(0.0, cat.get("confidence", 0.5))),
                })

        return valid_categories

    except Exception as e:
        logger.error(f"LLM classification failed: {e}")
        return []


def _merge_classifications(
    keyword_scores: dict[str, float],
    llm_categories: list[dict],
) -> list[dict[str, Any]]:
    """Merge keyword-based and LLM-based classifications."""
    merged: dict[str, float] = {}

    # Add keyword scores (weighted 0.3)
    for topic, score in keyword_scores.items():
        merged[topic] = score * 0.3

    # Add LLM scores (weighted 0.7)
    for cat in llm_categories:
        topic = cat["topic_slug"]
        llm_score = cat["confidence"] * 0.7
        merged[topic] = merged.get(topic, 0) + llm_score

    if not merged:
        # Fallback to "general"
        return [{"topic_slug": "general", "confidence": 0.5, "is_primary": True}]

    # Sort by score descending
    sorted_topics = sorted(merged.items(), key=lambda x: x[1], reverse=True)

    # Take top 3 (or fewer)
    categories = []
    for i, (topic, score) in enumerate(sorted_topics[:3]):
        if score >= 0.1:  # Minimum threshold
            categories.append({
                "topic_slug": topic,
                "confidence": round(min(1.0, score), 3),
                "is_primary": i == 0,
            })

    if not categories:
        categories = [{"topic_slug": "general", "confidence": 0.5, "is_primary": True}]

    return categories
