import asyncio
import httpx
import os
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

OTX_API_KEY = os.getenv("OTX_API_KEY", "")
OTX_BASE = "https://otx.alienvault.com/api/v1"

_threat_ips: set[str] = set()


def is_known_threat(ip: str) -> bool:
    return ip in _threat_ips


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
