"""IPInfo city lookup for session greeting.

Optional `IPINFO_TOKEN` — works without a token on limited free tier.
Never raises to the caller; always returns a usable city (default Delhi).
"""

from __future__ import annotations

import logging
import os
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_CITY = "Delhi"
FALLBACK_CITY = DEFAULT_CITY  # alias for older call sites

_PRIVATE_PREFIXES = (
    "127.",
    "10.",
    "192.168.",
    "172.16.",
    "172.17.",
    "172.18.",
    "172.19.",
    "172.2",
    "172.3",
    "::1",
    "fc",
    "fd",
    "fe80",
)


def _is_private(ip: str) -> bool:
    s = (ip or "").strip().lower()
    if not s or s in {"unknown", "localhost", "testclient"}:
        return True
    # Not an IPv4/IPv6 literal → treat as private (e.g. TestClient host)
    if not re.match(r"^(\d{1,3}\.){3}\d{1,3}$", s) and ":" not in s:
        return True
    return any(s.startswith(p) for p in _PRIVATE_PREFIXES)


def client_ip_from_headers(headers: dict, fallback: str = "127.0.0.1") -> str:
    """Prefer X-Forwarded-For / X-Real-IP when behind a proxy."""
    forwarded = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real = headers.get("x-real-ip") or headers.get("X-Real-IP")
    if real:
        return real.strip()
    return fallback


async def resolve_city_from_ip(ip: Optional[str] = None) -> dict:
    """Lookup city for an IP. Never fails the session.

    Returns:
        {
          "city": str,
          "source": "ipinfo" | "fallback",
          "ip": str | None,
          "is_local": bool,
        }
    """
    token = (os.environ.get("IPINFO_TOKEN") or "").strip()
    raw_ip = (ip or "").strip()
    is_local = _is_private(raw_ip)

    # Localhost / private: query IPInfo without an IP (egress address) so demos
    # still get a city; UI always allows override when wrong (VPN).
    path = "https://ipinfo.io/json" if is_local else f"https://ipinfo.io/{raw_ip}/json"
    params = {"token": token} if token else None

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(path, params=params)
            if response.status_code >= 400:
                logger.info("ipinfo_http_error status=%s", response.status_code)
                return {
                    "city": DEFAULT_CITY,
                    "source": "fallback",
                    "ip": raw_ip or None,
                    "is_local": is_local,
                }
            data = response.json()
            city = (data.get("city") or "").strip()
            if city:
                return {
                    "city": city.title(),
                    "source": "ipinfo",
                    "ip": data.get("ip") or raw_ip or None,
                    "is_local": is_local,
                }
    except Exception as exc:
        logger.info("ipinfo_failed err=%s", exc)

    return {
        "city": DEFAULT_CITY,
        "source": "fallback",
        "ip": raw_ip or None,
        "is_local": is_local,
    }


async def resolve_city(ip: str) -> str:
    """Simple helper — city name only (Delhi on any failure)."""
    result = await resolve_city_from_ip(ip)
    return str(result.get("city") or DEFAULT_CITY)


def greeting_for_city(city: str, *, lang: str = "en") -> str:
    name = (city or DEFAULT_CITY).strip() or DEFAULT_CITY
    if lang == "hi":
        return f"Namaste! {name} ke paas search karein?"
    return f"Hi! Searching near {name}?"
