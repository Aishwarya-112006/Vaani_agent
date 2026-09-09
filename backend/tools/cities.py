"""Shared India city extraction + common misspellings/aliases."""

from __future__ import annotations

from typing import Optional

# Canonical display name → substrings that map to it (checked in utterance lowercased)
_CITY_ALIASES: list[tuple[str, tuple[str, ...]]] = [
    ("Delhi", ("new delhi", "dilli", "delli", "delhi", "ncr")),
    ("Mumbai", ("mumbai", "bombay", "bambai", "mumbay")),
    (
        "Bangalore",
        (
            "bangalore",
            "bengaluru",
            "banglore",
            "bangalor",
            "bengalooru",
            "benglore",
            "bangaluru",
            "blr",
        ),
    ),
    ("Hyderabad", ("hyderabad", "hyd", "hydrabad", "hyderbad")),
    ("Chennai", ("chennai", "madras", "chenai")),
    ("Pune", ("pune", "poona")),
    ("Kolkata", ("kolkata", "calcutta", "kalkata")),
    ("Goa", ("goa",)),
    ("Jaipur", ("jaipur", "jaypur")),
]


def extract_city(text: str) -> Optional[str]:
    """Return canonical city if any known name/alias appears in text.

    When multiple cities are mentioned (e.g. \"Bangalore wait Jaipur\"), prefer the
    **last** occurrence — that's usually the correction the user meant.
    """
    s = (text or "").lower()
    if not s:
        return None
    # (end_index, alias_len, canonical) — latest end wins; longer alias breaks ties
    best: Optional[tuple[int, int, str]] = None
    for canonical, aliases in _CITY_ALIASES:
        for alias in aliases:
            start = 0
            while True:
                idx = s.find(alias, start)
                if idx < 0:
                    break
                end = idx + len(alias)
                cand = (end, len(alias), canonical)
                if best is None or cand[0] > best[0] or (cand[0] == best[0] and cand[1] > best[1]):
                    best = cand
                start = idx + 1
    return best[2] if best else None


def is_known_city_token(token: str) -> bool:
    """True if token is a known city name or alias (for area vs city disambiguation)."""
    t = (token or "").strip().lower()
    if not t:
        return False
    for _, aliases in _CITY_ALIASES:
        if t in aliases:
            return True
    return False
