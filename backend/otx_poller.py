import asyncio
import httpx
import os
import time
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

OTX_API_KEY = os.getenv("OTX_API_KEY", "")
OTX_BASE = "https://otx.alienvault.com/api/v1"
ABUSEIPDB_API_KEY = os.getenv("ABUSEIPDB_API_KEY", "")
ABUSEIPDB_BASE = "https://api.abuseipdb.com/api/v2"

_threat_ips: set[str] = set()
_abuse_cache: dict[str, tuple[int, float]] = {}  # ip -> (score, checked_at_epoch)
_ABUSE_TTL = 86400  # 24 hours


def is_known_threat(ip: str) -> bool:
    return ip in _threat_ips


def check_abuseipdb(ip: str) -> tuple[bool, int]:
    """Returns (is_threat, confidence_score 0-100). Caches results per IP for 24h."""
    if not ABUSEIPDB_API_KEY:
        return False, 0
    now = time.time()
    if ip in _abuse_cache:
        score, checked_at = _abuse_cache[ip]
        if now - checked_at < _ABUSE_TTL:
            return score >= 50, score
    try:
        with httpx.Client(timeout=5) as client:
            r = client.get(
                f"{ABUSEIPDB_BASE}/check",
                headers={"Key": ABUSEIPDB_API_KEY, "Accept": "application/json"},
                params={"ipAddress": ip, "maxAgeInDays": 90},
            )
            if r.status_code == 200:
                score = r.json()["data"]["abuseConfidenceScore"]
                _abuse_cache[ip] = (score, now)
                return score >= 50, score
    except Exception as e:
        logger.warning(f"AbuseIPDB check failed for {ip}: {e}")
    return False, 0


async def start_threat_poller():
    while True:
        try:
            await _refresh()
        except Exception as e:
            logger.error(f"Threat poller error: {e}")
        await asyncio.sleep(300)


async def _refresh():
    ips: set[str] = set()
    since = (datetime.utcnow() - timedelta(days=1)).isoformat()

    async with httpx.AsyncClient(timeout=30) as client:
        if OTX_API_KEY:
            try:
                r = await client.get(
                    f"{OTX_BASE}/pulses/subscribed",
                    headers={"X-OTX-API-KEY": OTX_API_KEY},
                    params={"limit": 20, "modified_since": since},
                )
                if r.status_code == 200:
                    for pulse in r.json().get("results", []):
                        for ind in pulse.get("indicators", []):
                            if ind.get("type") == "IPv4":
                                ips.add(ind["indicator"])
            except Exception as e:
                logger.warning(f"OTX fetch failed: {e}")

        try:
            r = await client.get("https://feodotracker.abuse.ch/downloads/ipblocklist.txt")
            if r.status_code == 200:
                for line in r.text.splitlines():
                    line = line.strip()
                    if line and not line.startswith("#"):
                        ips.add(line)
        except Exception as e:
            logger.warning(f"Feodo fetch failed: {e}")

    _threat_ips.clear()
    _threat_ips.update(ips)
    logger.info(f"Threat intel refreshed: {len(_threat_ips)} IPs")
