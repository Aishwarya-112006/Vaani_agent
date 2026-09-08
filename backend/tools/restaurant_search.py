"""Interruptible mock restaurant search tool.

`search_restaurants` sleeps 3–4 seconds (cancellable via asyncio task cancel),
then returns structured mock results. Cancellation raises CancelledError
so callers can treat the delay as interruptible — same behavior as search_hotels.
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Artificial latency window (seconds) — same as search_hotels
MIN_DELAY = 2.0
MAX_DELAY = 2.8

_MOCK_RESTAURANTS = [
    {
        "name": "Saffron Thali",
        "area": "Connaught Place",
        "cuisine": "North Indian",
        "rating": 4.6,
        "veg_only": True,
        "price_for_two": 800,
        "open_now": True,
    },
    {
        "name": "Coastal Catch",
        "area": "Karol Bagh",
        "cuisine": "South Indian",
        "rating": 4.3,
        "veg_only": False,
        "price_for_two": 1200,
        "open_now": True,
    },
    {
        "name": "Green Bowl Cafe",
        "area": "Hauz Khas",
        "cuisine": "Cafe",
        "rating": 4.4,
        "veg_only": True,
        "price_for_two": 600,
        "open_now": True,
    },
    {
        "name": "Spice Route Kitchen",
        "area": "Saket",
        "cuisine": "Indian",
        "rating": 4.5,
        "veg_only": False,
        "price_for_two": 1500,
        "open_now": False,
    },
    {
        "name": "Mumbai Street Kitchen",
        "area": "Connaught Place",
        "cuisine": "Street Food",
        "rating": 4.2,
        "veg_only": False,
        "price_for_two": 500,
        "open_now": True,
    },
    {
        "name": "Pure Veg Delight",
        "area": "Lajpat Nagar",
        "cuisine": "North Indian",
        "rating": 4.1,
        "veg_only": True,
        "price_for_two": 700,
        "open_now": True,
    },
]

_CUISINES = [
    ("south indian", "South Indian"),
    ("north indian", "North Indian"),
    ("street food", "Street Food"),
    ("chinese", "Chinese"),
    ("italian", "Italian"),
    ("mexican", "Mexican"),
    ("thai", "Thai"),
    ("mughlai", "Mughlai"),
    ("biryani", "Biryani"),
    ("cafe", "Cafe"),
    ("indian", "Indian"),
]

_AREAS = [
    "connaught place",
    "karol bagh",
    "hauz khas",
    "saket",
    "lajpat nagar",
    "aerocity",
    "india gate",
    "chandni chowk",
    "gurgaon",
    "noida",
    "bandra",
    "andheri",
    "koramangala",
    "indiranagar",
]

_CITIES = [
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


def parse_restaurant_params(
    text: str,
    previous: Optional[dict] = None,
    *,
    default_city: str = "Delhi",
) -> dict[str, Any]:
    """Extract restaurant search params from free text, merging with previous if present."""
    prev = dict(previous or {})
    # Drop hotel-only keys when pivoting
    prev.pop("budget", None)
    prev.pop("near_metro", None)

    s = (text or "").lower()

    city = next((c.title() if c != "bengaluru" else "Bangalore" for c in _CITIES if c in s), None)

    cuisine = None
    for key, label in _CUISINES:
        if key in s:
            cuisine = label
            break

    area = None
    for a in _AREAS:
        if a in s:
            area = a.title()
            break
    if area is None:
        area_match = re.search(
            r"(?:in|near|around|at)\s+([A-Za-z][A-Za-z\s]{2,30?}?)(?:\s+instead|\s+please|[.,!?]|$)",
            text or "",
            re.I,
        )
        if area_match:
            candidate = area_match.group(1).strip()
            if candidate.lower() not in _CITIES:
                area = candidate.title()

    veg_only = prev.get("veg_only", False)
    if re.search(r"\bveg(?:etarian)?\b|veg[- ]?only|pure\s+veg", s):
        veg_only = True
    if re.search(r"non[- ]?veg|any food|nonveg", s):
        veg_only = False

    same_city_only = bool(
        re.search(r"\bsame\b.*\b(but|in|for)\b|\bsame\s+search\b|\bbut\s+in\s+\w+", s)
    )
    if same_city_only and prev:
        resolved_city = city or prev.get("city") or (default_city.strip() if default_city else None)
        return {
            "city": resolved_city,
            "cuisine": prev.get("cuisine") or "Indian",
            "veg_only": bool(prev.get("veg_only", False)),
            "area": prev.get("area") or "Connaught Place",
            "city_required": resolved_city is None,
        }

    resolved_city = city or prev.get("city") or (default_city.strip() if default_city else None)

    return {
        "city": resolved_city,
        "cuisine": cuisine or prev.get("cuisine") or "Indian",
        "veg_only": bool(veg_only),
        "area": area or prev.get("area") or "Connaught Place",
        "city_required": resolved_city is None,
    }


async def search_restaurants(
    city: str,
    cuisine: str | None = "Indian",
    veg_only: bool = False,
    area: str | None = "Connaught Place",
    *,
    delay: float | None = None,
    reply_lang: str = "en",
) -> dict[str, Any]:
    """Search mock restaurants after an interruptible artificial delay.

    Raises:
        asyncio.CancelledError: if the surrounding task is cancelled mid-delay
            (REFINE / CANCEL / PIVOT interrupt).
    """
    city_name = (city or "Delhi").strip().title()
    cuisine_name = (cuisine or "Indian").strip()
    area_name = (area or "Connaught Place").strip().title()
    wait = delay if delay is not None else random.uniform(MIN_DELAY, MAX_DELAY)

    logger.info(
        "search_restaurants start city=%s cuisine=%s veg_only=%s area=%s delay=%.2fs lang=%s",
        city_name,
        cuisine_name,
        veg_only,
        area_name,
        wait,
        reply_lang,
    )

    # Interruptible delay — task.cancel() wakes this with CancelledError
    await asyncio.sleep(wait)

    cuisine_l = cuisine_name.lower()
    area_l = area_name.lower()

    results: list[dict[str, Any]] = []
    for spot in _MOCK_RESTAURANTS:
        if veg_only and not spot["veg_only"]:
            continue

        cuisine_match = cuisine_l in ("indian", "any", "") or cuisine_l in spot["cuisine"].lower()
        area_match = area_l in spot["area"].lower()

        # Soft filter: keep cuisine/area mismatches but rank them lower
        results.append(
            {
                "name": spot["name"],
                "city": city_name,
                "area": spot["area"] if area_match else area_name,
                "cuisine": spot["cuisine"],
                "rating": spot["rating"],
                "veg_only": spot["veg_only"],
                "price_for_two": spot["price_for_two"],
                "open_now": spot["open_now"],
                "_cuisine_match": cuisine_match,
                "_area_match": area_match,
            }
        )

    results.sort(
        key=lambda r: (
            -int(r["_cuisine_match"]),
            -int(r["_area_match"]),
            -r["rating"],
            r["price_for_two"],
        )
    )

    if not results:
        results = [
            {
                "name": "Local Kitchen",
                "city": city_name,
                "area": area_name,
                "cuisine": cuisine_name,
                "rating": 4.0,
                "veg_only": veg_only,
                "price_for_two": 750,
                "open_now": True,
                "_cuisine_match": True,
                "_area_match": True,
            }
        ]

    top = [{k: v for k, v in r.items() if not k.startswith("_")} for r in results[:3]]

    picks = ", ".join(f"{h['name']}" for h in top)
    contrast = ""
    if len(top) >= 2:
        a, b = top[0], top[1]
        contrast = (
            f" Compare: {a['name']} ₹{a['price_for_two']}/2 vs {b['name']} ₹{b['price_for_two']}/2."
        )

    summary = (
        f"{area_name}, {city_name} — {len(top)} restaurants"
        + (f", {cuisine_name}" if cuisine_name else "")
        + (" · veg" if veg_only else "")
        + f". {picks}.{contrast}"
    )

    payload = {
        "tool": "search_restaurants",
        "params": {
            "city": city_name,
            "cuisine": cuisine_name,
            "veg_only": veg_only,
            "area": area_name,
        },
        "count": len(top),
        "results": top,
        "summary": summary,
        "reply_lang": reply_lang,
        "delay_seconds": round(wait, 2),
    }

    logger.info("search_restaurants complete count=%s top=%s", len(top), top[0]["name"])
    return payload
