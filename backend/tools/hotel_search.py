"""Interruptible mock hotel search tool.

`search_hotels` sleeps ~2–2.8 seconds (cancellable via asyncio task cancel),
then returns structured mock results. Cancellation raises CancelledError
so callers can treat the delay as interruptible.
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import Any, Optional

from tools.cities import extract_city
from tools.mock_inventory import (
    default_area_for_city,
    hotels_for_city,
    normalize_city_key,
)

logger = logging.getLogger(__name__)

# Artificial latency window (seconds) — short enough for demo UX, still interruptible
MIN_DELAY = 2.0
MAX_DELAY = 2.8


def parse_hotel_params(
    text: str,
    previous: Optional[dict] = None,
    *,
    default_city: str = "Delhi",
) -> dict[str, Any]:
    """Extract hotel search params from free text, merging with previous if present."""
    prev = dict(previous or {})
    s = (text or "").lower()

    city = extract_city(s)

    budget_match = re.search(r"(?:under|below|upto|up to|₹|rs\.?)\s*(\d{3,6})", s, re.I)
    if not budget_match:
        budget_match = re.search(r"\b(\d{4,5})\b", s)
    budget = int(budget_match.group(1)) if budget_match else None

    near_metro = prev.get("near_metro", False)
    if re.search(
        r"near\s+(?:\w+\s+){0,4}metro|metro\s+station|metro\s+ke\s+paas|metro\s+paas",
        s,
    ):
        near_metro = True
    if re.search(r"not\s+near\s+metro|anywhere|kahin\s+bhi", s):
        near_metro = False

    veg_only = prev.get("veg_only", False)
    if re.search(r"\bveg(?:etarian)?\b|veg[- ]?only|veg[- ]?friendly|shakahari", s):
        veg_only = True
    if re.search(r"non[- ]?veg|any food|nonveg", s):
        veg_only = False

    # B7: "same but Mumbai" / "same search in Goa" — keep filters, swap city only
    same_city_only = bool(
        re.search(
            r"\bsame\b.*\b(but|in|for)\b|\bsame\s+search\b|\bbut\s+in\s+\w+",
            s,
        )
    )
    if same_city_only and prev:
        resolved_city = city or prev.get("city") or (default_city.strip() if default_city else None)
        return {
            "city": resolved_city,
            "budget": prev.get("budget", 5000),
            "near_metro": bool(prev.get("near_metro", False)),
            "veg_only": bool(prev.get("veg_only", False)) if not re.search(r"\bveg", s) else veg_only,
            "city_required": resolved_city is None,
            "budget_missing": "budget" not in prev and budget is None,
        }

    resolved_city = city or prev.get("city") or (default_city.strip() if default_city else None)
    budget_set = budget is not None or "budget" in prev
    resolved_budget = budget if budget is not None else prev.get("budget")

    return {
        "city": resolved_city,
        "budget": resolved_budget if resolved_budget is not None else 5000,
        "near_metro": bool(near_metro),
        "veg_only": bool(veg_only),
        "city_required": resolved_city is None,
        "budget_missing": not budget_set,
    }


def _contrast_hotels(top: list[dict], *, lang: str = "en") -> str:
    """One short compare line when at least two hotels are returned."""
    if len(top) < 2:
        return ""
    a, b = top[0], top[1]
    if lang == "hi":
        return f" Compare: {a['name']} ₹{a['price_inr']} vs {b['name']} ₹{b['price_inr']}."
    return f" Compare: {a['name']} ₹{a['price_inr']} vs {b['name']} ₹{b['price_inr']}."


def _format_hotel_summary(
    top: list[dict],
    city_name: str,
    cap: int,
    near_metro: bool,
    veg_only: bool,
    *,
    lang: str = "en",
) -> str:
    """Short spoken summary (keeps Rime TTS snappy). Budget is INR, not meters."""
    picks = ", ".join(f"{h['name']} ({h['area']}) ₹{h['price_inr']}" for h in top)
    metro = " near metro" if near_metro else ""
    veg = ", veg" if veg_only else ""
    contrast = _contrast_hotels(top, lang=lang)

    if lang == "hi":
        return (
            f"{city_name}, {cap} ke under{metro}{veg} — {len(top)} hotels. "
            f"{picks}.{contrast}"
        )
    return (
        f"{city_name}, under {cap}{metro}{veg} — {len(top)} hotels. "
        f"{picks}.{contrast}"
    )


async def search_hotels(
    city: str,
    budget: int | float | None = 5000,
    near_metro: bool = False,
    veg_only: bool = False,
    *,
    delay: float | None = None,
    reply_lang: str = "en",
) -> dict[str, Any]:
    """Search mock hotels after an interruptible artificial delay.

    Raises:
        asyncio.CancelledError: if the surrounding task is cancelled mid-delay
            (REFINE / CANCEL / PIVOT interrupt).
    """
    city_key = normalize_city_key(city)
    city_name = city_key
    cap = int(budget) if budget is not None else 5000
    wait = delay if delay is not None else random.uniform(MIN_DELAY, MAX_DELAY)

    logger.info(
        "search_hotels start city=%s budget=%s near_metro=%s veg_only=%s delay=%.2fs lang=%s",
        city_name,
        cap,
        near_metro,
        veg_only,
        wait,
        reply_lang,
    )

    # Interruptible delay — task.cancel() wakes this with CancelledError
    await asyncio.sleep(wait)

    results = []
    for hotel in hotels_for_city(city_key):
        if hotel["price_inr"] > cap:
            continue
        if near_metro and not hotel["near_metro"]:
            continue
        if veg_only and not hotel["veg_friendly"]:
            continue
        results.append(
            {
                "name": hotel["name"],
                "city": city_name,
                "area": hotel["area"],
                "price_inr": hotel["price_inr"],
                "rating": hotel["rating"],
                "near_metro": hotel["near_metro"],
                "veg_friendly": hotel["veg_friendly"],
                "amenities": hotel["amenities"],
            }
        )

    # Always return something useful for the demo
    if not results:
        results = [
            {
                "name": "Budget Nest",
                "city": city_name,
                "area": default_area_for_city(city_key),
                "price_inr": min(cap, 2500),
                "rating": 3.9,
                "near_metro": near_metro,
                "veg_friendly": veg_only,
                "amenities": ["wifi"],
            }
        ]

    results.sort(key=lambda h: (-h["rating"], h["price_inr"]))
    top = results[:3]

    payload = {
        "tool": "search_hotels",
        "params": {
            "city": city_name,
            "budget": cap,
            "near_metro": near_metro,
            "veg_only": veg_only,
        },
        "count": len(top),
        "results": top,
        "summary": _format_hotel_summary(
            top, city_name, cap, near_metro, veg_only, lang=reply_lang
        ),
        "reply_lang": reply_lang,
        "delay_seconds": round(wait, 2),
    }

    logger.info("search_hotels complete count=%s top=%s", len(top), top[0]["name"])
    return payload
