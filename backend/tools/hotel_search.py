"""Interruptible hotel search tool.

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

from tools.cities import extract_city
from tools.mock_inventory import (
    default_area_for_city,
    hotels_for_city,
    normalize_city_key,
)
from tools.real_places import (
    enrich_with_coords,
    live_hotels,
    live_places_enabled,
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
        r"near\s+(?:\w+\s+){0,4}metro|metro\s+station|metro\s+ke\s+paas|metro\s+paas|metro\s+ke\s+pass",
        s,
    ):
        near_metro = True
    if re.search(r"not\s+near\s+metro|anywhere|kahin\s+bhi", s):
        near_metro = False

    veg_only = prev.get("veg_only", False)
    if re.search(
        r"\bveg(?:etarian)?\b|veg[- ]?only|veg[- ]?friendly|shakahari|pure\s+veg|sirf\s+veg",
        s,
    ):
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


def _hotel_pick_label(h: dict) -> str:
    area = h.get("area") or ""
    price = h.get("price_inr")
    base = f"{h['name']} ({area})" if area else str(h["name"])
    if price is not None:
        return f"{base} ₹{price}"
    return base


def _contrast_hotels(top: list[dict], *, lang: str = "en") -> str:
    """One short compare line when at least two hotels are returned."""
    if len(top) < 2:
        return ""
    a, b = top[0], top[1]
    a_price, b_price = a.get("price_inr"), b.get("price_inr")
    if a_price is not None and b_price is not None:
        return f" Compare: {a['name']} ₹{a_price} vs {b['name']} ₹{b_price}."
    return f" Compare: {a['name']} vs {b['name']}."


def _format_hotel_summary(
    top: list[dict],
    city_name: str,
    cap: int,
    near_metro: bool,
    veg_only: bool,
    *,
    lang: str = "en",
    budget_filtered: bool = True,
) -> str:
    """Short spoken summary (keeps Rime TTS snappy). Budget is INR, not meters."""
    picks = ", ".join(_hotel_pick_label(h) for h in top)
    metro = " near metro" if near_metro else ""
    veg = ", veg" if veg_only else ""
    contrast = _contrast_hotels(top, lang=lang)

    if budget_filtered:
        if lang == "hi":
            return (
                f"{city_name}, {cap} ke under{metro}{veg} — {len(top)} hotels. "
                f"{picks}.{contrast}"
            )
        return (
            f"{city_name}, under {cap}{metro}{veg} — {len(top)} hotels. "
            f"{picks}.{contrast}"
        )

    if lang == "hi":
        return f"{city_name}{metro}{veg} — {len(top)} hotels. {picks}.{contrast}"
    return f"{city_name}{metro}{veg} — {len(top)} hotels. {picks}.{contrast}"


def _rows_from_live_hotels(
    places: list[dict[str, Any]],
    *,
    city_name: str,
    veg_only: bool,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for p in places:
        area = (p.get("area") or "").strip() or city_name
        rows.append(
            {
                "name": p.get("name") or "Hotel",
                "city": p.get("city") or city_name,
                "area": area,
                "price_inr": None,
                "rating": None,
                "near_metro": bool(p.get("near_metro", False)),
                "veg_friendly": veg_only,
                "amenities": [],
                "lat": p.get("lat"),
                "lon": p.get("lon"),
                "distance_m": p.get("distance_m"),
                "address": p.get("address") or "",
                "metro_distance_m": p.get("metro_distance_m"),
                "metro_name": p.get("metro_name"),
            }
        )
    return rows[:3]


async def _mock_search_hotels(
    city_key: str,
    city_name: str,
    cap: int,
    near_metro: bool,
    veg_only: bool,
    *,
    wait: float,
    reply_lang: str,
) -> dict[str, Any]:
    await asyncio.sleep(wait)

    results = []
    for hotel in hotels_for_city(city_key):
        if hotel["price_inr"] > cap:
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
                "_metro_match": bool(hotel["near_metro"]),
            }
        )

    if near_metro:
        metro_hits = [h for h in results if h["_metro_match"]]
        if len(metro_hits) >= 2:
            results = metro_hits

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
                "_metro_match": near_metro,
            }
        ]

    results.sort(
        key=lambda h: (
            -int(h.get("_metro_match", False)) if near_metro else 0,
            -h["rating"],
            h["price_inr"],
        )
    )
    top = [{k: v for k, v in h.items() if not k.startswith("_")} for h in results[:3]]
    top = await enrich_with_coords(top, city=city_name)

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
        "source": "mock",
    }
    logger.info("search_hotels complete source=mock count=%s top=%s", len(top), top[0]["name"])
    return payload


async def search_hotels(
    city: str,
    budget: int | float | None = 5000,
    near_metro: bool = False,
    veg_only: bool = False,
    *,
    delay: float | None = None,
    reply_lang: str = "en",
) -> dict[str, Any]:
    """Search hotels (live Geoapify when enabled, else mock).

    Raises:
        asyncio.CancelledError: if the surrounding task is cancelled mid-await
            (REFINE / CANCEL / PIVOT interrupt).
    """
    city_key = normalize_city_key(city)
    city_name = city_key
    cap = int(budget) if budget is not None else 5000
    wait = delay if delay is not None else random.uniform(MIN_DELAY, MAX_DELAY)

    logger.info(
        "search_hotels start city=%s budget=%s near_metro=%s veg_only=%s live=%s lang=%s",
        city_name,
        cap,
        near_metro,
        veg_only,
        live_places_enabled(),
        reply_lang,
    )

    if live_places_enabled():
        try:
            # Cancelable pause so REFINE/CANCEL still have a demo window under live.
            live_wait = delay if delay is not None else random.uniform(1.6, 2.2)
            await asyncio.sleep(live_wait)
            places = await live_hotels(city_name, near_metro=near_metro, limit=15)
            if places:
                top = _rows_from_live_hotels(places, city_name=city_name, veg_only=veg_only)
                notes = [
                    "Live OSM listings rarely include prices — showing nearby matches "
                    "without filtering by budget."
                ]
                if veg_only:
                    notes.append(
                        "Vegetarian preference is noted in the summary; OSM hotels "
                        "aren't hard-filtered for veg-friendly."
                    )
                budget_note = " ".join(notes)
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
                        top,
                        city_name,
                        cap,
                        near_metro,
                        veg_only,
                        lang=reply_lang,
                        budget_filtered=False,
                    ),
                    "reply_lang": reply_lang,
                    "delay_seconds": round(live_wait, 2),
                    "source": "geoapify+osm",
                    "budget_filtered": False,
                    "budget_note": budget_note,
                }
                logger.info(
                    "search_hotels complete source=live count=%s top=%s",
                    len(top),
                    top[0]["name"],
                )
                return payload
            logger.info("search_hotels live empty for city=%s — no mock while live mode on", city_name)
            empty = {
                "tool": "search_hotels",
                "params": {
                    "city": city_name,
                    "budget": cap,
                    "near_metro": near_metro,
                    "veg_only": veg_only,
                },
                "count": 0,
                "results": [],
                "summary": (
                    f"No live hotel matches found near {city_name}"
                    + (" / metro" if near_metro else "")
                    + ". Try another area."
                ),
                "reply_lang": reply_lang,
                "delay_seconds": round(live_wait, 2),
                "source": "geoapify+osm",
                "budget_filtered": False,
                "budget_note": "Live OSM search returned no matches — mock inventory is disabled while USE_LIVE_PLACES=1.",
            }
            return empty
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — still avoid inventing mock names in live mode
            logger.warning("search_hotels live failed (no mock): %s", exc)
            return {
                "tool": "search_hotels",
                "params": {
                    "city": city_name,
                    "budget": cap,
                    "near_metro": near_metro,
                    "veg_only": veg_only,
                },
                "count": 0,
                "results": [],
                "summary": f"Live hotel search failed for {city_name}. Check Geoapify key / network.",
                "reply_lang": reply_lang,
                "delay_seconds": None,
                "source": "geoapify+osm",
                "budget_note": str(exc)[:160],
            }

    return await _mock_search_hotels(
        city_key,
        city_name,
        cap,
        near_metro,
        veg_only,
        wait=wait,
        reply_lang=reply_lang,
    )

