"""Shared India city extraction + common misspellings/aliases."""

from __future__ import annotations

from typing import Optional

# Canonical display name → substrings that map to it (checked in utterance lowercased)
_CITY_ALIASES: list[tuple[str, tuple[str, ...]]] = [
    ("Delhi", ("delhi", "new delhi", "ncr")),
    ("Mumbai", ("mumbai", "bombay")),
    ("Bangalore", ("bangalore", "bengaluru", "banglore", "bangalor", "bengalooru", "blr")),
    ("Hyderabad", ("hyderabad", "hyd")),
    ("Chennai", ("chennai", "madras")),
    ("Pune", ("pune",)),
    ("Kolkata", ("kolkata", "calcutta")),
    ("Goa", ("goa",)),
    ("Jaipur", ("jaipur",)),
]


def extract_city(text: str) -> Optional[str]:
    """Return canonical city if any known name/alias appears in text."""
    s = (text or "").lower()
    if not s:
        return None
    # Longer aliases first so "new delhi" wins over "delhi" when both listed
    for canonical, aliases in _CITY_ALIASES:
        for alias in sorted(aliases, key=len, reverse=True):
            if alias in s:
                return canonical
    return None


def is_known_city_token(token: str) -> bool:
    """True if token is a known city name or alias (for area vs city disambiguation)."""
    t = (token or "").strip().lower()
    if not t:
        return False
    for _, aliases in _CITY_ALIASES:
        if t in aliases:
            return True
    return False
