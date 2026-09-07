import logging
import httpx

logger = logging.getLogger(__name__)

FALLBACK_EN = "Sorry, I couldn't find that — search is still running."
FALLBACK_HI = "Woh nahi mila — search continue kar rahi hoon."


def _fallback(reply_lang: str = "en") -> str:
    return FALLBACK_HI if reply_lang == "hi" else FALLBACK_EN


def _cap_sentences(text: str, max_sentences: int = 2) -> str:
    """Cap text to max_sentences sentences for TTS."""
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return " ".join(sentences[:max_sentences])


async def fetch_wiki_summary(query: str, reply_lang: str = "en") -> str:
    """Fetch Wikipedia summary for query. Returns capped 2-sentence summary or fallback."""
    title = query.strip().replace(" ", "_")
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, headers={"User-Agent": "VaaniAgent/1.0"})
            if response.status_code == 200:
                data = response.json()
                extract = data.get("extract", "").strip()
                if extract:
                    return _cap_sentences(extract, max_sentences=2)
            logger.warning(f"Wikipedia returned {response.status_code} for '{query}'")
    except Exception as e:
        logger.warning(f"Wikipedia fetch failed for '{query}': {e}")

    return _fallback(reply_lang)