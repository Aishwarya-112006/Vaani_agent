"""Live hotel & restaurant search via Geoapify (OpenStreetMap).

Used as an optional data source behind search_hotels / search_restaurants.
Mock inventory remains the default when USE_LIVE_PLACES is off, the key is
missing, or the API fails — so interrupts, eval, and demos stay reliable.

Setup:
  GEOAPIFY_API_KEY=...   # https://myprojects.geoapify.com/ (no card)
  USE_LIVE_PLACES=1      # explicit opt-in (tests/CI leave this unset/0)
"""

from __future__ import annotations

import logging
import math
import os
from pathlib import Path
from typing import Any, Optional

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search"
PLACES_URL = "https://api.geoapify.com/v2/places"

_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


def _refresh_env() -> None:
    """Re-read backend/.env so flag/key edits apply after code reload.

    Tests set VAANI_LOCK_PLACES_ENV=1 so a developer .env cannot flip live on.
    """
    if os.environ.get("VAANI_LOCK_PLACES_ENV", "").strip() == "1":
        return
    if _ENV_PATH.is_file():
        load_dotenv(_ENV_PATH, override=True)


# In-memory geocode cache (cleared on process restart — fine for demos).
_city_coord_cache: dict[str, tuple[float, float]] = {}

_CUISINE_CATEGORY: dict[str, str] = {
    "chinese": "catering.restaurant.chinese",
    "italian": "catering.restaurant.italian",
    "mexican": "catering.restaurant.mexican",
    "thai": "catering.restaurant.thai",
    "seafood": "catering.restaurant.seafood",
    "pizza": "catering.restaurant.pizza",
    "japanese": "catering.restaurant.japanese",
    "french": "catering.restaurant.french",
    "cafe": "catering.cafe",
    "coffee": "catering.cafe",
    # Indian subtypes — OSM rarely has fine-grained cats; use broad restaurant.
    "indian": "catering.restaurant",
    "south indian": "catering.restaurant",
    "north indian": "catering.restaurant",
    "biryani": "catering.restaurant",
    "mughlai": "catering.restaurant",
    "street food": "catering.fast_food",
    "rajasthani": "catering.restaurant",
}


def geoapify_api_key() -> str:
    _refresh_env()
    return (os.environ.get("GEOAPIFY_API_KEY") or "").strip()


def live_places_enabled() -> bool:
    """Live Places only when key is set AND USE_LIVE_PLACES is truthy."""
    _refresh_env()
    flag = (os.environ.get("USE_LIVE_PLACES") or "0").strip().lower()
    return bool(geoapify_api_key()) and flag in ("1", "true", "yes", "on")


def geocode_available() -> bool:
    """Geocode-only enrichment (map pins on mock) when key exists."""
    return bool(geoapify_api_key())


def _restaurant_category(cuisine: Optional[str]) -> str:
    if not cuisine:
        return "catering.restaurant"
    key = cuisine.strip().lower()
    if key in _CUISINE_CATEGORY:
        return _CUISINE_CATEGORY[key]
    # South/North Indian, biryani, etc. — broad category (OSM subcats are sparse)
    return "catering.restaurant"


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def geocode_city(city: str) -> Optional[tuple[float, float]]:
    """Resolve any city/area name in India to (lat, lon)."""
    key = city.strip().lower()
    if not key:
        return None
    if key in _city_coord_cache:
        return _city_coord_cache[key]

    api_key = geoapify_api_key()
    if not api_key:
        return None

    text = city if "india" in key else f"{city}, India"
    params = {
        "text": text,
        "apiKey": api_key,
        "limit": 1,
        "filter": "countrycode:in",
    }
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(GEOCODE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features") or []
    if not features:
        logger.info("Geocoding miss for city=%r", city)
        return None

    lon, lat = features[0]["geometry"]["coordinates"]
    coords = (float(lat), float(lon))
    _city_coord_cache[key] = coords
    return coords


async def search_places(
    lat: float,
    lon: float,
    categories: str,
    conditions: Optional[str] = None,
    radius_m: int = 8000,
    limit: int = 15,
) -> list[dict[str, Any]]:
    api_key = geoapify_api_key()
    if not api_key:
        return []

    params: dict[str, Any] = {
        "categories": categories,
        "filter": f"circle:{lon},{lat},{radius_m}",
        "bias": f"proximity:{lon},{lat}",
        "limit": limit,
        "apiKey": api_key,
    }
    if conditions:
        params["conditions"] = conditions

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(PLACES_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    results: list[dict[str, Any]] = []
    for feature in data.get("features") or []:
        props = feature.get("properties") or {}
        results.append(
            {
                "name": props.get("name")
                or props.get("address_line1")
                or "Unnamed listing",
                "address": props.get("formatted") or "",
                "city": props.get("city") or "",
                "area": props.get("suburb")
                or props.get("district")
                or props.get("neighbourhood")
                or props.get("address_line2")
                or "",
                "lat": props.get("lat"),
                "lon": props.get("lon"),
                "distance_m": props.get("distance"),
                "categories": props.get("categories") or [],
            }
        )
    return results


async def fetch_metro_stations(
    lat: float, lon: float, radius_m: int = 10000
) -> list[dict[str, Any]]:
    return await search_places(
        lat,
        lon,
        categories="public_transport.subway,railway.subway,railway.light_rail",
        radius_m=radius_m,
        limit=25,
    )


def tag_near_metro(
    places: list[dict[str, Any]],
    stations: list[dict[str, Any]],
    max_m: float = 1500.0,
) -> list[dict[str, Any]]:
    """Annotate places with nearest metro distance; set near_metro if within max_m."""
    out: list[dict[str, Any]] = []
    for p in places:
        plat, plon = p.get("lat"), p.get("lon")
        nearest_name = None
        nearest_m: Optional[float] = None
        if plat is not None and plon is not None and stations:
            for s in stations:
                slat, slon = s.get("lat"), s.get("lon")
                if slat is None or slon is None:
                    continue
                d = _haversine_m(float(plat), float(plon), float(slat), float(slon))
                if nearest_m is None or d < nearest_m:
                    nearest_m = d
                    nearest_name = s.get("name")
        near = nearest_m is not None and nearest_m <= max_m
        row = dict(p)
        row["near_metro"] = near
        row["metro_distance_m"] = round(nearest_m) if nearest_m is not None else None
        row["metro_name"] = nearest_name
        out.append(row)
    return out


async def live_hotels(
    city: str,
    *,
    near_metro: bool = False,
    limit: int = 15,
) -> list[dict[str, Any]]:
    coords = await geocode_city(city)
    if coords is None:
        return []
    lat, lon = coords
    places = await search_places(
        lat,
        lon,
        categories="accommodation.hotel,accommodation.guest_house,accommodation.hostel",
        radius_m=10000,
        limit=limit,
    )
    if near_metro and places:
        stations = await fetch_metro_stations(lat, lon)
        places = tag_near_metro(places, stations)
        metro_hits = [p for p in places if p.get("near_metro")]
        if len(metro_hits) >= 2:
            places = metro_hits
    return places


async def live_restaurants(
    city: str,
    *,
    cuisine: Optional[str] = None,
    veg_only: bool = False,
    area: Optional[str] = None,
    near_metro: bool = False,
    limit: int = 15,
) -> list[dict[str, Any]]:
    search_target = f"{area}, {city}" if area else city
    coords = await geocode_city(search_target)
    if coords is None and area:
        coords = await geocode_city(city)
    if coords is None:
        return []
    lat, lon = coords
    category = _restaurant_category(cuisine)
    conditions = "vegetarian" if veg_only else None
    places = await search_places(
        lat, lon, categories=category, conditions=conditions, radius_m=6000, limit=limit
    )
    if not places and cuisine:
        places = await search_places(
            lat,
            lon,
            categories="catering.restaurant",
            conditions=conditions,
            radius_m=6000,
            limit=limit,
        )
    if near_metro and places:
        stations = await fetch_metro_stations(lat, lon)
        places = tag_near_metro(places, stations)
        metro_hits = [p for p in places if p.get("near_metro")]
        if len(metro_hits) >= 2:
            places = metro_hits
    return places


async def enrich_with_coords(
    rows: list[dict[str, Any]],
    *,
    city: str,
) -> list[dict[str, Any]]:
    """Attach lat/lon to mock rows via geocoding area+city (for map pins)."""
    if not geocode_available() or not rows:
        return rows
    out: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        if item.get("lat") is not None and item.get("lon") is not None:
            out.append(item)
            continue
        area = (item.get("area") or "").strip()
        query = f"{area}, {city}" if area else city
        try:
            coords = await geocode_city(query)
        except Exception as exc:  # noqa: BLE001 — enrich is best-effort
            logger.debug("coord enrich miss query=%r err=%s", query, exc)
            coords = None
        if coords:
            item["lat"], item["lon"] = coords
        out.append(item)
    return out
