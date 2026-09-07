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

logger = logging.getLogger(__name__)

# Artificial latency window (seconds) — short enough for demo UX, still interruptible
MIN_DELAY = 2.0
MAX_DELAY = 2.8

_MOCK_HOTELS = [
    {
        "name": "The Lotus Residency",
        "area": "Connaught Place",
        "price_inr": 4200,
        "rating": 4.5,
        "near_metro": True,
        "veg_friendly": True,
        "amenities": ["breakfast", "wifi", "ac"],
    },
    {
        "name": "Metro Inn Deluxe",
        "area": "Karol Bagh",
        "price_inr": 3100,
        "rating": 4.1,
        "near_metro": True,
        "veg_friendly": False,
        "amenities": ["wifi", "parking"],
    },
    {
        "name": "Saffron Stay",
        "area": "Saket",
        "price_inr": 4800,
        "rating": 4.6,
        "near_metro": False,
        "veg_friendly": True,
        "amenities": ["breakfast", "pool", "spa"],
    },
    {
        "name": "Green Leaf Boutique",
        "area": "Hauz Khas",
        "price_inr": 3600,
        "rating": 4.3,
        "near_metro": True,
        "veg_friendly": True,
        "amenities": ["veg kitchen", "wifi", "workspace"],
    },
    {
        "name": "CityPulse Hotel",
        "area": "Aerocity",
        "price_inr": 5500,
        "rating": 4.4,
        "near_metro": False,
        "veg_friendly": False,
        "amenities": ["airport shuttle", "gym"],
    },
]


def parse_hotel_params(
    text: str,
    previous: Optional[dict] = None,
    *,
    default_city: str = "Delhi",
) -> dict[str, Any]:
    """Extract hotel search params from free text, merging with previous if present."""
    prev = dict(previous or {})
    s = (text or "").lower()

    cities = [
        "delhi",
        "mumbai",
        "bangalore",
        "bengaluru",
        "hyderabad",
        "chennai",
        "pune",
        "kolkata",
        "goa",
        "jaipur",
    ]
    city = next((c.title() if c != "bengaluru" else "Bangalore" for c in cities if c in s), None)

    budget_match = re.search(r"(?:under|below|upto|up to|₹|rs\.?)\s*(\d{3,6})", s, re.I)
    if not budget_match:
        budget_match = re.search(r"\b(\d{4,5})\b", s)
    budget = int(budget_match.group(1)) if budget_match else None

    near_metro = prev.get("near_metro", False)
    if re.search(
        r"near\s+(a\s+|the\s+)?metro|metro\s+station|metro\s+ke\s+paas|metro\s+paas",
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

    return {
        "city": city or prev.get("city") or default_city or "Delhi",
        "budget": budget if budget is not None else prev.get("budget", 5000),
        "near_metro": bool(near_metro),
        "veg_only": bool(veg_only),
    }


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
    picks = ", ".join(f"{h['name']} {h['price_inr']}" for h in top)
    metro = " near metro" if near_metro else ""
    veg = ", veg" if veg_only else ""

    if lang == "hi":
        return (
            f"{city_name}, {cap} ke under{metro}{veg} — {len(top)} hotels. "
            f"{picks}."
        )
    return (
        f"{city_name}, under {cap}{metro}{veg} — {len(top)} hotels. "
        f"{picks}."
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
    city_name = (city or "Delhi").strip().title()
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
    for hotel in _MOCK_HOTELS:
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
                "area": "City Center",
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
