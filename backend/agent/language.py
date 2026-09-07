"""Detect reply language from user text (English vs Hindi/Hinglish)."""

from __future__ import annotations

import re

# Devanagari block
_DEVANAGARI = re.compile(r"[\u0900-\u097F]")

# Common Hindi / Hinglish markers (romanized)
_HI_MARKERS = re.compile(
    r"\b("
    r"hai|hain|hoon|hun|kya|kyu|kyun|kaise|kaisa|kaisi|"
    r"chahiye|chahie|bolo|batao|bataiye|dikhao|"
    r"mujhe|mera|meri|mere|aap|tum|hum|"
    r"nahi|nahin|mat|abhi|phir|thoda|bahut|"
    r"dhundo|dhoondho|dhoondh|milao|sasta|mehenga|"
    r"ke\s+paas|ke\s+under"
    r")\b",
    re.I,
)


def detect_reply_lang(text: str, previous: str | None = None) -> str:
    """Return 'hi' or 'en' for TTS / spoken copy.

    Sticky: once the user clearly speaks Hindi/Hinglish, keep 'hi' until
    they switch to a clearly English-only utterance without Hindi markers.
    """
    s = (text or "").strip()
    if not s:
        return previous or "en"

    if _DEVANAGARI.search(s):
        return "hi"
    if _HI_MARKERS.search(s):
        return "hi"

    # Clear English booking phrasing → switch / stay English
    if re.search(r"\b(find|search|hotel|restaurant|under|near|please|actually|want)\b", s, re.I):
        return "en"

    return previous or "en"


def rime_lang_code(reply_lang: str) -> str:
    """Map app reply lang → Rime `lang` value."""
    return "hin" if reply_lang == "hi" else "eng"
