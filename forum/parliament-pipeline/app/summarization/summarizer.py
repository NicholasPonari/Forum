"""LLM-based summarization: generates layperson-friendly debate summaries.

Uses OpenAI GPT-4o to produce structured EN and FR summaries.
"""

import json
import logging
from typing import Any

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

MODEL = "gpt-4o"
MAX_TRANSCRIPT_CHARS = 80_000  # ~20k tokens for transcript context


def generate_summary(
    debate: dict[str, Any],
    transcripts: list[dict[str, Any]],
    contributions: list[dict[str, Any]],
    votes: list[dict[str, Any]],
    language: str = "en",
) -> dict[str, Any]:
    """Generate a layperson-friendly summary of a debate.

    Args:
        debate: Debate record with metadata.
        transcripts: Transcript records.
        contributions: Contribution records (with speaker info).
        votes: Vote records.
        language: Target language ('en' or 'fr').

    Returns:
        Dict with summary_text, key_participants, key_issues, outcome_text, model.
    """
    client = OpenAI(api_key=settings.openai_api_key)

    # Build context for the LLM
    context = _build_context(debate, transcripts, contributions, votes)

    # System prompt
    if language == "fr":
        system_prompt = _get_french_system_prompt()
    else:
        system_prompt = _get_english_system_prompt()

    user_prompt = _build_user_prompt(context, language)

    logger.info(f"Generating {language} summary for debate {debate['id']} ({len(user_prompt)} chars)")

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=4000,
            response_format={"type": "json_object"},
        )

        result_text = response.choices[0].message.content
        result = json.loads(result_text)

        return {
            "summary_text": result.get("summary", ""),
            "key_participants": result.get("key_participants", []),
            "key_issues": result.get("key_issues", []),
            "outcome_text": result.get("outcome", ""),
            "model": MODEL,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        # Fallback: use raw response as summary text
        return {
            "summary_text": result_text if 'result_text' in dir() else "Summary generation failed.",
            "key_participants": [],
            "key_issues": [],
            "outcome_text": None,
            "model": MODEL,
        }
    except Exception as e:
        logger.error(f"LLM summarization failed: {e}")
        raise


def _get_english_system_prompt() -> str:
    return """You are a civic engagement summarizer for Canadian parliamentary debates. 
Your job is to make parliamentary proceedings accessible to everyday citizens.

You MUST respond with a JSON object containing these fields:

{
  "summary": "A 2-3 paragraph plain-language summary explaining what this debate was about, the key disagreements or points of consensus, and what was decided.",
  "key_participants": [
    {
      "name": "Full Name",
      "party": "Party Name",
      "riding": "Riding Name (if known)",
      "stance_summary": "1-2 sentence description of their main argument or position"
    }
  ],
  "key_issues": [
    {
      "issue": "Short issue label",
      "description": "1-2 sentence description of the issue and why it matters"
    }
  ],
  "outcome": "What was decided? Vote result, referral to committee, or other procedural outcome. Null if nothing was decided."
}

Guidelines:
- Write for a general audience. Avoid jargon and parliamentary procedure terms.
- Focus on the "so what?" - why should citizens care about this debate?
- Be factual and balanced. Present all sides fairly.
- Include specific policy details, numbers, and concrete impacts when mentioned.
- Mention the most active/important speakers (limit to 5-8 key participants).
- Identify 3-6 key issues discussed.
- Keep the summary under 400 words."""


def _get_french_system_prompt() -> str:
    return """Vous êtes un résumeur d'engagement civique pour les débats parlementaires canadiens.
Votre rôle est de rendre les travaux parlementaires accessibles aux citoyens ordinaires.

Vous DEVEZ répondre avec un objet JSON contenant ces champs:

{
  "summary": "Un résumé de 2-3 paragraphes en langage simple expliquant le sujet du débat, les principaux désaccords ou points de consensus, et ce qui a été décidé.",
  "key_participants": [
    {
      "name": "Nom complet",
      "party": "Nom du parti",
      "riding": "Nom de la circonscription (si connu)",
      "stance_summary": "Description de 1-2 phrases de leur argument ou position principale"
    }
  ],
  "key_issues": [
    {
      "issue": "Étiquette courte de l'enjeu",
      "description": "Description de 1-2 phrases de l'enjeu et pourquoi il est important"
    }
  ],
  "outcome": "Qu'est-ce qui a été décidé? Résultat du vote, renvoi en comité, ou autre résultat procédural. Null si rien n'a été décidé."
}

Directives:
- Écrivez pour un public général. Évitez le jargon et les termes de procédure parlementaire.
- Concentrez-vous sur le "et alors?" - pourquoi les citoyens devraient-ils s'intéresser à ce débat?
- Soyez factuel et équilibré. Présentez tous les points de vue de manière équitable.
- Incluez des détails de politique spécifiques, des chiffres et des impacts concrets lorsqu'ils sont mentionnés.
- Mentionnez les orateurs les plus actifs/importants (limitez à 5-8 participants clés).
- Identifiez 3-6 enjeux clés discutés.
- Gardez le résumé sous 400 mots."""


def _build_context(
    debate: dict,
    transcripts: list[dict],
    contributions: list[dict],
    votes: list[dict],
) -> dict:
    """Build a context dict for the LLM prompt."""
    legislature = debate.get("legislatures", {})

    # Prepare transcript text (truncated if needed)
    transcript_text = ""
    for t in transcripts:
        raw = t.get("raw_text", "")
        if raw:
            transcript_text += f"\n--- Transcript ({t.get('language', 'unknown')}) ---\n"
            transcript_text += raw[:MAX_TRANSCRIPT_CHARS // len(transcripts)]

    # Prepare speaker contributions summary
    speaker_summaries = []
    for c in contributions[:50]:  # Limit to first 50 contributions
        speaker_info = c.get("debate_speakers") or {}
        speaker_name = speaker_info.get("name", c.get("speaker_name_raw", "Unknown"))
        party = speaker_info.get("party", "")
        text_preview = c.get("text", "")[:300]
        speaker_summaries.append(f"[{speaker_name} ({party})]: {text_preview}")

    # Prepare vote info
    vote_summaries = []
    for v in votes:
        vote_summaries.append(
            f"Vote: {v.get('motion_text', v.get('motion_text_fr', 'Unknown motion'))} "
            f"- Yea: {v.get('yea', 0)}, Nay: {v.get('nay', 0)} "
            f"- Result: {v.get('result', 'unknown')}"
        )

    return {
        "legislature_name": legislature.get("name", ""),
        "legislature_code": legislature.get("code", ""),
        "debate_title": debate.get("title", ""),
        "debate_date": debate.get("date", ""),
        "session_type": debate.get("session_type", ""),
        "transcript_text": transcript_text,
        "speaker_summaries": speaker_summaries,
        "vote_summaries": vote_summaries,
    }


def _build_user_prompt(context: dict, language: str) -> str:
    """Build the user prompt from context."""
    parts = []

    parts.append(f"## Debate Information")
    parts.append(f"Legislature: {context['legislature_name']} ({context['legislature_code']})")
    parts.append(f"Title: {context['debate_title']}")
    parts.append(f"Date: {context['debate_date']}")
    parts.append(f"Type: {context['session_type']}")

    if context['vote_summaries']:
        parts.append(f"\n## Votes")
        for v in context['vote_summaries']:
            parts.append(f"- {v}")

    if context['speaker_summaries']:
        parts.append(f"\n## Key Speaker Contributions (first {len(context['speaker_summaries'])})")
        for s in context['speaker_summaries'][:30]:
            parts.append(s)

    if context['transcript_text']:
        parts.append(f"\n## Transcript Excerpt")
        parts.append(context['transcript_text'][:MAX_TRANSCRIPT_CHARS])

    lang_label = "English" if language == "en" else "French"
    parts.append(f"\n## Task")
    parts.append(f"Generate the summary in {lang_label}. Respond with the JSON object only.")

    return "\n".join(parts)
