"""Wikipedia FACT aside — short extract for side questions mid-search."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

FALLBACK_EN = "Sorry, I couldn't find that — search is still running."
FALLBACK_HI = "Woh nahi mila — search continue kar rahi hoon."

# Wikipedia requires a descriptive UA with contact — bare names get 403.
_WIKI_HEADERS = {
    "User-Agent": (
        "VaaniAgent/1.0 (DataForge hackathon voice agent; "
        "https://github.com/dataforge/Vaani_agent; contact@localhost)"
    ),
    "Accept": "application/json",
}


def _fallback(reply_lang: str = "en") -> str:
    return FALLBACK_HI if reply_lang == "hi" else FALLBACK_EN


def _cap_sentences(text: str, max_sentences: int = 2) -> str:
    """Cap text to max_sentences sentences for TTS."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(sentences[:max_sentences])


def clean_wiki_query(query: str) -> str:
    """Strip FACT prefixes/suffixes and trailing punctuation from a user utterance."""
    q = (query or "").strip()
    q = re.sub(
        r"(?i)^(what is|tell me about|who is|kya hai|kya hota|batao)\s+",
        "",
        q,
    )
    q = re.sub(r"(?i)^the\s+", "", q).strip()
    q = re.sub(r"[?!.,;:]+$", "", q).strip()
    q = re.sub(r"(?i)\s+(kya hai|kya hota hai|kya hota|batao)\s*$", "", q).strip()
    return q


async def _fetch_summary_title(title: str) -> dict | None:
    if not title:
        return None
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title)}"
    async with httpx.AsyncClient(timeout=6.0) as client:
        response = await client.get(url, headers=_WIKI_HEADERS)
        if response.status_code != 200:
            logger.warning("Wikipedia returned %s for %r", response.status_code, title)
            return None
        return response.json()


async def fetch_wiki_summary(query: str, reply_lang: str = "en") -> str:
    """Fetch Wikipedia summary for query. Returns capped 2-sentence summary or fallback."""
    cleaned = clean_wiki_query(query)
    if not cleaned:
        return _fallback(reply_lang)

    candidates = [cleaned]
    # Disambiguation pages (e.g. Connaught Place) — prefer India / New Delhi sense.
    lower = cleaned.lower()
    if "delhi" not in lower and "india" not in lower:
        candidates.append(f"{cleaned}, New Delhi")
        candidates.append(f"{cleaned}, India")

    try:
        for title in candidates:
            data = await _fetch_summary_title(title)
            if not data:
                continue
            page_type = (data.get("type") or "").lower()
            extract = (data.get("extract") or "").strip()
            if not extract:
                continue
            if page_type == "disambiguation":
                # Try India-specific titles before giving up on this extract
                continue
            return _cap_sentences(extract, max_sentences=2)

        # Last resort: use disambiguation extract if nothing better
        data = await _fetch_summary_title(cleaned)
        if data:
            extract = (data.get("extract") or "").strip()
            if extract:
                return _cap_sentences(extract, max_sentences=2)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Wikipedia fetch failed for %r: %s", cleaned, exc)

    return _fallback(reply_lang)
