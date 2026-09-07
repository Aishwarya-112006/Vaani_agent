import os
import logging
import httpx

logger = logging.getLogger(__name__)

FALLBACK_CITY = "Delhi"


async def resolve_city(ip: str) -> str:
    """Resolve IP to city using IPInfo free tier. Falls back to Delhi on any error."""
    
    # Skip for localhost/private IPs
    if not ip or ip in ("127.0.0.1", "::1", "localhost") or ip.startswith("192.168") or ip.startswith("10."):
        logger.info(f"Local/private IP {ip} — using fallback city")
        return FALLBACK_CITY

    token = os.environ.get("IPINFO_TOKEN", "")
    url = f"https://ipinfo.io/{ip}/json"
    if token:
        url += f"?token={token}"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                data = response.json()
                city = data.get("city", "").strip()
                if city:
                    logger.info(f"IPInfo resolved {ip} → {city}")
                    return city
    except Exception as e:
        logger.warning(f"IPInfo failed for {ip}: {e}")

    return FALLBACK_CITY