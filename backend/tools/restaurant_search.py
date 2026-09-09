"""Interruptible restaurant search tool.

Default: mock inventory with ~2–2.8s cancelable delay (demo/eval).
Optional: Geoapify live Places when USE_LIVE_PLACES=1 and GEOAPIFY_API_KEY
are set — same return shape, mock fallback on miss/error.
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
from tools.real_places import (
    enrich_with_coords,
    live_places_enabled,
    live_restaurants,
)

logger = logging.getLogger(__name__)

# Artificial latency window (seconds) — long enough to demo interrupts mid-search
MIN_DELAY = 4.0
MAX_DELAY = 5.0

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
    if re.search(
        r"\bveg(?:etarian)?\b|veg[- ]?only|pure\s+veg|shakahari|sirf\s+veg",
        s,
    ):
        veg_only = True
    if re.search(r"non[- ]?veg|any food|nonveg", s):
        veg_only = False

    near_metro = bool(prev.get("near_metro", False))
    if re.search(
        r"near\s+(?:\w+\s+){0,4}metro|metro\s+station|metro\s+ke\s+paas|metro\s+paas|metro\s+ke\s+pass",
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


async def _mock_search_restaurants(
    city_key: str,
    city_name: str,
    cuisine_name: str,
    veg_only: bool,
    area_name: str,
    near_metro: bool,
    area_explicit: bool,
    *,
    wait: float,
    reply_lang: str,
) -> dict[str, Any]:
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
    top = await enrich_with_coords(top, city=city_name)

    picks = ", ".join(f"{h['name']} ({h['area']})" for h in top)
    contrast = ""
    if len(top) >= 2:
        a, b = top[0], top[1]
        a_p, b_p = a.get("price_for_two"), b.get("price_for_two")
        if a_p is not None and b_p is not None:
            contrast = (
                f" Compare: {a['name']} ₹{a_p}/2 vs {b['name']} ₹{b_p}/2."
            )
        else:
            contrast = f" Compare: {a['name']} vs {b['name']}."

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
        "source": "mock",
    }
    logger.info(
        "search_restaurants complete source=mock count=%s top=%s",
        len(top),
        top[0]["name"],
    )
    return payload


def _rows_from_live_restaurants(
    places: list[dict[str, Any]],
    *,
    city_name: str,
    cuisine_name: str,
    veg_only: bool,
    area_name: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for p in places:
        area = (p.get("area") or "").strip() or area_name or city_name
        rows.append(
            {
                "name": p.get("name") or "Restaurant",
                "city": p.get("city") or city_name,
                "area": area,
                "cuisine": cuisine_name,
                "rating": None,
                "veg_only": veg_only,
                "price_for_two": None,
                "open_now": None,
                "near_metro": bool(p.get("near_metro", False)),
                "lat": p.get("lat"),
                "lon": p.get("lon"),
                "distance_m": p.get("distance_m"),
                "address": p.get("address") or "",
                "metro_distance_m": p.get("metro_distance_m"),
                "metro_name": p.get("metro_name"),
            }
        )
    return rows[:3]


def _live_restaurant_summary(
    top: list[dict[str, Any]],
    *,
    city_name: str,
    cuisine_name: str,
    veg_only: bool,
    area_name: str,
    area_explicit: bool,
    near_metro: bool,
) -> str:
    picks = ", ".join(f"{h['name']} ({h['area']})" for h in top)
    contrast = ""
    if len(top) >= 2:
        contrast = f" Compare: {top[0]['name']} vs {top[1]['name']}."
    place_lead = f"{area_name}, {city_name}" if area_explicit and area_name else city_name
    metro_bit = " near metro" if near_metro else ""
    return (
        f"{place_lead}{metro_bit} — {len(top)} restaurants"
        + (f", {cuisine_name}" if cuisine_name else "")
        + (" · veg" if veg_only else "")
        + f". {picks}.{contrast}"
    )


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
    """Search restaurants (live Geoapify when enabled, else mock).

    Raises:
        asyncio.CancelledError: if the surrounding task is cancelled mid-await
            (REFINE / CANCEL / PIVOT interrupt).
    """
    city_key = normalize_city_key(city)
    city_name = city_key
    cuisine_name = (cuisine or "Indian").strip()
    area_name = (area or default_area_for_city(city_key)).strip()
    wait = delay if delay is not None else random.uniform(MIN_DELAY, MAX_DELAY)

    logger.info(
        "search_restaurants start city=%s cuisine=%s veg_only=%s area=%s near_metro=%s live=%s lang=%s",
        city_name,
        cuisine_name,
        veg_only,
        area_name,
        near_metro,
        live_places_enabled(),
        reply_lang,
    )

    if live_places_enabled():
        try:
            # Cancelable pause so REFINE/CANCEL still have a demo window under live.
            live_wait = delay if delay is not None else random.uniform(MIN_DELAY, MAX_DELAY)
            await asyncio.sleep(live_wait)
            places = await live_restaurants(
                city_name,
                cuisine=cuisine_name,
                veg_only=veg_only,
                area=area_name if area_explicit else None,
                near_metro=near_metro,
                limit=15,
            )
            if places:
                top = _rows_from_live_restaurants(
                    places,
                    city_name=city_name,
                    cuisine_name=cuisine_name,
                    veg_only=veg_only,
                    area_name=area_name,
                )
                budget_note = (
                    "Live OSM listings usually omit prices and ratings — "
                    "showing nearby matches"
                    + (" with a vegetarian filter where tagged." if veg_only else ".")
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
                    "summary": _live_restaurant_summary(
                        top,
                        city_name=city_name,
                        cuisine_name=cuisine_name,
                        veg_only=veg_only,
                        area_name=area_name,
                        area_explicit=area_explicit,
                        near_metro=near_metro,
                    ),
                    "reply_lang": reply_lang,
                    "delay_seconds": round(live_wait, 2),
                    "source": "geoapify+osm",
                    "budget_note": budget_note,
                }
                logger.info(
                    "search_restaurants complete source=live count=%s top=%s",
                    len(top),
                    top[0]["name"],
                )
                return payload
            logger.info(
                "search_restaurants live empty for city=%s — no mock while live mode on",
                city_name,
            )
            return {
                "tool": "search_restaurants",
                "params": {
                    "city": city_name,
                    "cuisine": cuisine_name,
                    "veg_only": veg_only,
                    "area": area_name,
                    "near_metro": near_metro,
                    "area_explicit": area_explicit,
                },
                "count": 0,
                "results": [],
                "summary": (
                    f"No live restaurants found near {city_name}"
                    + (" / metro" if near_metro else "")
                    + ". Try another area."
                ),
                "reply_lang": reply_lang,
                "delay_seconds": round(live_wait, 2),
                "source": "geoapify+osm",
                "budget_note": "Live OSM search returned no matches — mock inventory is disabled while USE_LIVE_PLACES=1.",
            }
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("search_restaurants live failed (no mock): %s", exc)
            return {
                "tool": "search_restaurants",
                "params": {
                    "city": city_name,
                    "cuisine": cuisine_name,
                    "veg_only": veg_only,
                    "area": area_name,
                    "near_metro": near_metro,
                    "area_explicit": area_explicit,
                },
                "count": 0,
                "results": [],
                "summary": f"Live restaurant search failed for {city_name}. Check Geoapify key / network.",
                "reply_lang": reply_lang,
                "delay_seconds": None,
                "source": "geoapify+osm",
                "budget_note": str(exc)[:160],
            }

    return await _mock_search_restaurants(
        city_key,
        city_name,
        cuisine_name,
        veg_only,
        area_name,
        near_metro,
        area_explicit,
        wait=wait,
        reply_lang=reply_lang,
    )

