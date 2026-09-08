"""Interruptible mock restaurant search tool.

`search_restaurants` sleeps ~2–2.8 seconds (cancellable via asyncio task cancel),
then returns structured mock results. Cancellation raises CancelledError
so callers can treat the delay as interruptible — same behavior as search_hotels.
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import Any, Optional

from tools.cities import extract_city, is_known_city_token
from tools.mock_inventory import (
    all_parseable_areas,
    city_for_area,
    default_area_for_city,
    normalize_city_key,
    restaurants_for_city,
)

logger = logging.getLogger(__name__)

# Artificial latency window (seconds) — same as search_hotels
MIN_DELAY = 2.0
MAX_DELAY = 2.8

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
    ("seafood", "Seafood"),
    ("rajasthani", "Rajasthani"),
    ("cafe", "Cafe"),
    ("indian", "Indian"),
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

    s = (text or "").lower()

    city = extract_city(s)

    cuisine = None
    for key, label in _CUISINES:
        if key in s:
            cuisine = label
            break

    area = None
    for a in all_parseable_areas():
        if a in s:
            area = a.title().replace("Mg Road", "MG Road").replace("Hsr Layout", "HSR Layout")
            area = area.replace("Fc Road", "FC Road").replace("Mi Road", "MI Road")
            area = area.replace("T Nagar", "T Nagar")
            if a == "t nagar":
                area = "T Nagar"
            elif a == "mg road":
                area = "MG Road"
            elif a == "hsr layout":
                area = "HSR Layout"
            elif a == "fc road":
                area = "FC Road"
            elif a == "mi road":
                area = "MI Road"
            elif a == "hitech city":
                area = "Hitech City"
            break
    if area is None:
        area_match = re.search(
            r"(?:in|near|around|at)\s+([A-Za-z][A-Za-z\s]{2,30?}?)(?:\s+instead|\s+please|[.,!?]|$)",
            text or "",
            re.I,
        )
        if area_match:
            candidate = area_match.group(1).strip()
            # Don't treat "banglore metro station" / city names as an area
            cand_l = candidate.lower()
            if (
                not is_known_city_token(candidate)
                and extract_city(candidate) is None
                and "metro" not in cand_l
            ):
                area = candidate.title()

    veg_only = prev.get("veg_only", False)
    if re.search(r"\bveg(?:etarian)?\b|veg[- ]?only|pure\s+veg", s):
        veg_only = True
    if re.search(r"non[- ]?veg|any food|nonveg", s):
        veg_only = False

    near_metro = bool(prev.get("near_metro", False))
    if re.search(
        r"near\s+(?:\w+\s+){0,4}metro|metro\s+station|metro\s+ke\s+paas|metro\s+paas",
        s,
    ):
        near_metro = True
    if re.search(r"not\s+near\s+metro|anywhere|kahin\s+bhi", s):
        near_metro = False

    same_city_only = bool(
        re.search(r"\bsame\b.*\b(but|in|for)\b|\bsame\s+search\b|\bbut\s+in\s+\w+", s)
    )
    resolved_city = city or prev.get("city") or (default_city.strip() if default_city else None)

    # Infer city from neighbourhood when utterance only names an area (e.g. Connaught Place)
    if not resolved_city and area:
        resolved_city = city_for_area(area)
    if not resolved_city and prev.get("area"):
        resolved_city = city_for_area(str(prev.get("area")))

    if same_city_only and prev:
        return {
            "city": resolved_city,
            "cuisine": prev.get("cuisine") or "Indian",
            "veg_only": bool(prev.get("veg_only", False)),
            "area": prev.get("area") or default_area_for_city(resolved_city),
            "near_metro": bool(prev.get("near_metro", False)),
            "city_required": resolved_city is None,
            "area_explicit": bool(prev.get("area_explicit")),
        }

    area_explicit = area is not None or bool(prev.get("area_explicit") and prev.get("area"))
    resolved_area = area or (prev.get("area") if prev.get("area_explicit") else None)
    if not resolved_area:
        resolved_area = default_area_for_city(resolved_city)

    return {
        "city": resolved_city,
        "cuisine": cuisine or prev.get("cuisine") or "Indian",
        "veg_only": bool(veg_only),
        "area": resolved_area,
        "near_metro": bool(near_metro),
        "city_required": resolved_city is None,
        "area_explicit": area_explicit,
    }


async def search_restaurants(
    city: str,
    cuisine: str | None = "Indian",
    veg_only: bool = False,
    area: str | None = None,
    *,
    near_metro: bool = False,
    area_explicit: bool = False,
    delay: float | None = None,
    reply_lang: str = "en",
) -> dict[str, Any]:
    """Search mock restaurants after an interruptible artificial delay.

    Raises:
        asyncio.CancelledError: if the surrounding task is cancelled mid-delay
            (REFINE / CANCEL / PIVOT interrupt).
    """
    city_key = normalize_city_key(city)
    city_name = city_key
    cuisine_name = (cuisine or "Indian").strip()
    area_name = (area or default_area_for_city(city_key)).strip()
    wait = delay if delay is not None else random.uniform(MIN_DELAY, MAX_DELAY)

    logger.info(
        "search_restaurants start city=%s cuisine=%s veg_only=%s area=%s near_metro=%s delay=%.2fs lang=%s",
        city_name,
        cuisine_name,
        veg_only,
        area_name,
        near_metro,
        wait,
        reply_lang,
    )

    await asyncio.sleep(wait)

    cuisine_l = cuisine_name.lower()
    area_l = area_name.lower()

    results: list[dict[str, Any]] = []
    for spot in restaurants_for_city(city_key):
        if veg_only and not spot["veg_only"]:
            continue

        cuisine_match = (
            cuisine_l in ("indian", "any", "")
            or cuisine_l in spot["cuisine"].lower()
            or (
                cuisine_l == "indian"
                and spot["cuisine"].lower()
                in ("north indian", "south indian", "rajasthani")
            )
        )
        area_match = area_l in spot["area"].lower() or spot["area"].lower() in area_l
        metro_match = bool(spot.get("near_metro", False))

        results.append(
            {
                "name": spot["name"],
                "city": city_name,
                "area": spot["area"],
                "cuisine": spot["cuisine"],
                "rating": spot["rating"],
                "veg_only": spot["veg_only"],
                "price_for_two": spot["price_for_two"],
                "open_now": spot["open_now"],
                "near_metro": metro_match,
                "_cuisine_match": cuisine_match,
                "_area_match": area_match,
                "_metro_match": metro_match,
            }
        )

    # Prefer metro matches when requested; hard-drop only if we still have enough hits
    if near_metro:
        metro_hits = [r for r in results if r["_metro_match"]]
        if len(metro_hits) >= 2:
            results = metro_hits

    results.sort(
        key=lambda r: (
            -int(r["_cuisine_match"]),
            -int(r["_metro_match"]) if near_metro else 0,
            -int(r["_area_match"]) if area_explicit else 0,
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
                "near_metro": near_metro,
                "_cuisine_match": True,
                "_area_match": True,
            }
        ]

    top = [{k: v for k, v in r.items() if not k.startswith("_")} for r in results[:3]]

    picks = ", ".join(f"{h['name']} ({h['area']})" for h in top)
    contrast = ""
    if len(top) >= 2:
        a, b = top[0], top[1]
        contrast = (
            f" Compare: {a['name']} ₹{a['price_for_two']}/2 vs {b['name']} ₹{b['price_for_two']}/2."
        )

    # City-wide: lead with city; area-specific: lead with area
    place_lead = f"{area_name}, {city_name}" if area_explicit else city_name
    metro_bit = " near metro" if near_metro else ""
    summary = (
        f"{place_lead}{metro_bit} — {len(top)} restaurants"
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
            "near_metro": near_metro,
            "area_explicit": area_explicit,
        },
        "count": len(top),
        "results": top,
        "summary": summary,
        "reply_lang": reply_lang,
        "delay_seconds": round(wait, 2),
    }

    logger.info("search_restaurants complete count=%s top=%s", len(top), top[0]["name"])
    return payload
