"""Wikipedia FACT aside — short extract for side questions mid-search."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

FALLBACK_EN = "Sorry, I couldn't find that — search is still running."
FALLBACK_HI = "Woh nahi mila — search continue kar rahi hoon."

# Wikipedia requires a descriptive UA — bare names get HTTP 403.
_WIKI_HEADERS = {
    "User-Agent": (
        "VaaniAgent/1.0 (DataForge hackathon; "
        "+https://github.com/dataforge/Vaani_agent; vaani-demo@localhost)"
    ),
    "Accept": "application/json",
}

# Tiny offline seeds so FACT still demos if Wikipedia blocks the network.
_OFFLINE: dict[str, str] = {
    "connaught place": (
        "Connaught Place, also known as Rajiv Chowk, is a major financial and "
        "commercial centre in New Delhi. It is a popular shopping and tourist destination."
    ),
    "india gate": (
        "India Gate is a war memorial on Rajpath in New Delhi. It commemorates "
        "soldiers of the British Indian Army who died in the First World War."
    ),
    "gateway of india": (
        "The Gateway of India is an arch-monument in Mumbai. It was built in the "
        "early 20th century and overlooks the Arabian Sea."
    ),
    "delhi": (
        "Delhi is the capital territory of India and includes New Delhi. "
        "It is one of the largest metro areas in the world."
    ),
    "mumbai": (
        "Mumbai is the capital of Maharashtra and India's financial centre. "
        "It is home to the Bollywood film industry."
    ),
}


def _fallback(reply_lang: str = "en") -> str:
    return FALLBACK_HI if reply_lang == "hi" else FALLBACK_EN


def _cap_sentences(text: str, max_sentences: int = 2) -> str:
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


async def _fetch_action_extract(title: str) -> str | None:
    """MediaWiki Action API — usually more reliable than REST summary for bots."""
    params = {
        "action": "query",
        "prop": "extracts",
        "exintro": "1",
        "explaintext": "1",
        "redirects": "1",
        "titles": title,
        "format": "json",
        "formatversion": "2",
    }
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params=params,
            headers=_WIKI_HEADERS,
        )
        if response.status_code != 200:
            logger.warning("Wiki action API %s for %r", response.status_code, title)
            return None
        pages = (response.json().get("query") or {}).get("pages") or []
        if not pages:
            return None
        page = pages[0]
        if page.get("missing"):
            return None
        extract = (page.get("extract") or "").strip()
        return extract or None


async def _fetch_rest_summary(title: str) -> dict | None:
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title)}"
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(url, headers=_WIKI_HEADERS)
        if response.status_code != 200:
            logger.warning("Wiki REST %s for %r", response.status_code, title)
            return None
        return response.json()


async def fetch_wiki_summary(query: str, reply_lang: str = "en") -> str:
    """Fetch a short Wikipedia extract, with offline seeds as last resort."""
    cleaned = clean_wiki_query(query)
    if not cleaned:
        return _fallback(reply_lang)

    candidates = [cleaned]
    lower = cleaned.lower()
    if "delhi" not in lower and "india" not in lower:
        # Prefer India sense first (Connaught Place, etc. are often disambiguation hubs)
        candidates = [f"{cleaned}, New Delhi", f"{cleaned}, India", cleaned]

    try:
        for title in candidates:
            extract = await _fetch_action_extract(title)
            if extract and len(extract) > 40:
                low = extract.lower()
                if "may refer to" in low or "various places" in low or "can refer to" in low:
                    continue
                return _cap_sentences(extract, max_sentences=2)

        for title in candidates:
            data = await _fetch_rest_summary(title)
            if not data:
                continue
            if (data.get("type") or "").lower() == "disambiguation":
                continue
            extract = (data.get("extract") or "").strip()
            if extract:
                return _cap_sentences(extract, max_sentences=2)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Wikipedia fetch failed for %r: %s", cleaned, exc)

    offline = _OFFLINE.get(cleaned.lower())
    if offline:
        logger.info("FACT offline seed for %r", cleaned)
        return offline

    return _fallback(reply_lang)
