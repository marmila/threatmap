import asyncio
import httpx
import os
import time
import logging
from datetime import datetime, timedelta

from db import get_db

logger = logging.getLogger(__name__)

OTX_API_KEY = os.getenv("OTX_API_KEY", "")
OTX_BASE = "https://otx.alienvault.com/api/v1"
ABUSEIPDB_API_KEY = os.getenv("ABUSEIPDB_API_KEY", "")
ABUSEIPDB_BASE = "https://api.abuseipdb.com/api/v2"
SHODAN_API_KEY = os.getenv("SHODAN_API_KEY", "")
SHODAN_BASE = "https://api.shodan.io"

_threat_ips: dict[str, str] = {}
_abuse_cache: dict[str, tuple[dict, float]] = {}   # ip -> (data, checked_at_epoch)
_shodan_cache: dict[str, tuple[dict, float]] = {}  # ip -> (data, checked_at_epoch)
_reported_cache: dict[str, float] = {}             # ip -> last_reported_at
_ABUSE_TTL = 86400      # 24 hours per-IP AbuseIPDB cache
_SHODAN_TTL = 2592000  # 30 days — Shodan membership = 100 credits/month; 42 IPs/day × 30d fits budget
_REPORT_TTL = 900      # 15 min minimum between reports for same IP (AbuseIPDB TOS)

_REPORTABLE_TYPES = {"cowrie.login.failed", "cowrie.login.success", "cowrie.command.input"}


def is_known_threat(ip: str) -> tuple[bool, str]:
    """Returns (is_threat, source_name). Source is OTX pulse name, 'Feodo Tracker', or 'AbuseIPDB Blacklist'."""
    src = _threat_ips.get(ip)
    return (True, src) if src else (False, "")


async def check_abuseipdb(ip: str) -> tuple[bool, dict]:
    """Returns (is_threat, data dict). Two-level cache: in-memory L1 + MongoDB L2.

    L1 resets on restart; L2 persists across restarts/deploys, preventing quota burn.
    data keys: score, total_reports, distinct_users, last_reported, isp, usage_type, is_tor
    """
    if not ABUSEIPDB_API_KEY:
        return False, {}
    now = time.time()

    # L1: in-memory — avoids DB round-trip for IPs seen in this session
    if ip in _abuse_cache:
        data, checked_at = _abuse_cache[ip]
        if now - checked_at < _ABUSE_TTL:
            return data.get("score", 0) >= 50, data

    # L2: MongoDB — survives pod restarts and deploys
    try:
        doc = await get_db().ip_cache.find_one(
            {"ip": ip}, {"abuse_data": 1, "abuse_cached_at": 1}
        )
        if doc and doc.get("abuse_cached_at"):
            age = (datetime.utcnow() - doc["abuse_cached_at"]).total_seconds()
            if age < _ABUSE_TTL:
                data = doc["abuse_data"]
                _abuse_cache[ip] = (data, now)
                return data.get("score", 0) >= 50, data
    except Exception as e:
        logger.warning(f"ip_cache read failed for {ip}: {e}")

    # Cache miss — call AbuseIPDB API
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                f"{ABUSEIPDB_BASE}/check",
                headers={"Key": ABUSEIPDB_API_KEY, "Accept": "application/json"},
                params={"ipAddress": ip, "maxAgeInDays": 90},
            )
            if r.status_code == 200:
                d = r.json()["data"]
                data = {
                    "score": d.get("abuseConfidenceScore", 0),
                    "total_reports": d.get("totalReports", 0),
                    "distinct_users": d.get("numDistinctUsers", 0),
                    "last_reported": d.get("lastReportedAt"),
                    "isp": d.get("isp"),
                    "usage_type": d.get("usageType"),
                    "is_tor": d.get("isTor", False),
                }
                _abuse_cache[ip] = (data, now)
                try:
                    await get_db().ip_cache.update_one(
                        {"ip": ip},
                        {"$set": {
                            "abuse_data": data,
                            "abuse_cached_at": datetime.utcnow(),
                            "expires_at": datetime.utcnow() + timedelta(days=30),
                        }},
                        upsert=True,
                    )
                except Exception as e:
                    logger.warning(f"ip_cache write failed for {ip}: {e}")
                return data["score"] >= 50, data
    except Exception as e:
        logger.warning(f"AbuseIPDB check failed for {ip}: {e}")
    return False, {}


async def check_shodan(ip: str) -> dict:
    """Returns Shodan host data dict. Two-level cache: in-memory L1 + MongoDB L2.

    data keys: ports, tags, vulns, org, isp, asn, hostnames, os, last_update
    """
    if not SHODAN_API_KEY:
        return {}
    now = time.time()

    # L1: in-memory
    if ip in _shodan_cache:
        data, checked_at = _shodan_cache[ip]
        if now - checked_at < _SHODAN_TTL:
            return data

    # L2: MongoDB
    try:
        doc = await get_db().ip_cache.find_one(
            {"ip": ip}, {"shodan_data": 1, "shodan_cached_at": 1}
        )
        if doc and doc.get("shodan_cached_at"):
            age = (datetime.utcnow() - doc["shodan_cached_at"]).total_seconds()
            if age < _SHODAN_TTL:
                data = doc["shodan_data"]
                _shodan_cache[ip] = (data, now)
                return data
    except Exception as e:
        logger.warning(f"ip_cache read failed for {ip}: {e}")

    # Cache miss — call Shodan API
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{SHODAN_BASE}/shodan/host/{ip}",
                params={"key": SHODAN_API_KEY},
            )
            if r.status_code == 200:
                d = r.json()
                services = d.get("data") or []
                banners, http_titles, ssl_cns = [], [], []
                for svc in services:
                    product = svc.get("product")
                    version = svc.get("version")
                    if product:
                        label = f"{product} {version}".strip() if version else product
                        if label not in banners:
                            banners.append(label)
                    title = (svc.get("http") or {}).get("title")
                    if title and title.strip() and title not in http_titles:
                        http_titles.append(title.strip())
                    cn = (((svc.get("ssl") or {}).get("cert") or {}).get("subject") or {}).get("CN")
                    if cn and cn not in ssl_cns:
                        ssl_cns.append(cn)
                data = {
                    "ports": sorted(d.get("ports", [])),
                    "tags": d.get("tags", []),
                    "vulns": sorted(d["vulns"].keys() if isinstance(d.get("vulns"), dict) else d.get("vulns") or []),
                    "org": d.get("org"),
                    "isp": d.get("isp"),
                    "asn": d.get("asn"),
                    "hostnames": d.get("hostnames", []),
                    "domains": d.get("domains", []),
                    "os": d.get("os"),
                    "last_update": d.get("last_update"),
                    "banners": banners[:5],
                    "http_titles": http_titles[:3],
                    "ssl_cns": ssl_cns[:3],
                }
            elif r.status_code == 404:
                data = {}
            else:
                return {}

            _shodan_cache[ip] = (data, now)
            try:
                await get_db().ip_cache.update_one(
                    {"ip": ip},
                    {"$set": {
                        "shodan_data": data,
                        "shodan_cached_at": datetime.utcnow(),
                        "expires_at": datetime.utcnow() + timedelta(days=7),
                    }},
                    upsert=True,
                )
            except Exception as e:
                logger.warning(f"ip_cache write failed for {ip}: {e}")
            return data
    except Exception as e:
        logger.warning(f"Shodan check failed for {ip}: {e}")
    return {}


async def report_to_abuseipdb(ip: str, event_type: str) -> None:
    """Auto-report attacking IPs back to AbuseIPDB (contributes to community blocklist)."""
    if not ABUSEIPDB_API_KEY or event_type not in _REPORTABLE_TYPES:
        return
    now = time.time()
    if ip in _reported_cache and now - _reported_cache[ip] < _REPORT_TTL:
        return
    _reported_cache[ip] = now

    if event_type == "cowrie.command.input":
        categories, comment = "22", "SSH intrusion — commands executed in Cowrie honeypot"
    elif event_type == "cowrie.login.success":
        categories, comment = "22", "SSH unauthorized access via Cowrie honeypot"
    else:
        categories, comment = "18,22", "SSH brute-force against Cowrie honeypot"

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(
                f"{ABUSEIPDB_BASE}/report",
                headers={"Key": ABUSEIPDB_API_KEY, "Accept": "application/json"},
                data={"ip": ip, "categories": categories, "comment": comment},
            )
            if r.status_code == 200:
                logger.info(f"Reported {ip} to AbuseIPDB ({event_type})")
            else:
                logger.warning(f"AbuseIPDB report failed for {ip}: HTTP {r.status_code} {r.text[:100]}")
    except Exception as e:
        logger.warning(f"AbuseIPDB report error for {ip}: {e}")


async def start_threat_poller():
    await _refresh_blacklist()
    cycles = 0
    while True:
        try:
            await _refresh()
        except Exception as e:
            logger.error(f"Threat poller error: {e}")
        cycles += 1
        if cycles % 72 == 0:
            try:
                await _refresh_blacklist()
            except Exception as e:
                logger.error(f"Blacklist refresh error: {e}")
        await asyncio.sleep(300)


async def _refresh():
    ips: dict[str, str] = {}
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
                        pulse_name = pulse.get("name", "OTX")
                        for ind in pulse.get("indicators", []):
                            if ind.get("type") == "IPv4":
                                ips.setdefault(ind["indicator"], pulse_name)
            except Exception as e:
                logger.warning(f"OTX fetch failed: {e}")

        try:
            r = await client.get("https://feodotracker.abuse.ch/downloads/ipblocklist.txt")
            if r.status_code == 200:
                for line in r.text.splitlines():
                    line = line.strip()
                    if line and not line.startswith("#"):
                        ips.setdefault(line, "Feodo Tracker")
        except Exception as e:
            logger.warning(f"Feodo fetch failed: {e}")

    _threat_ips.clear()
    _threat_ips.update(ips)
    logger.info(f"Threat intel refreshed: {len(_threat_ips)} IPs")


_BLACKLIST_INTERVAL = 8 * 3600  # 8 hours minimum between fetches (free plan: 5/day hard limit)


async def _refresh_blacklist():
    if not ABUSEIPDB_API_KEY:
        return

    # Check last fetch time in MongoDB — prevents extra calls on pod restarts
    try:
        meta = await get_db().meta.find_one({"_id": "blacklist_last_fetch"})
        if meta:
            age = (datetime.utcnow() - meta["fetched_at"]).total_seconds()
            if age < _BLACKLIST_INTERVAL:
                logger.info(f"Skipping blacklist refresh, last fetch was {age / 3600:.1f}h ago")
                return
    except Exception as e:
        logger.warning(f"meta read failed: {e}")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.get(
                f"{ABUSEIPDB_BASE}/blacklist",
                headers={"Key": ABUSEIPDB_API_KEY, "Accept": "text/plain"},
                params={"confidenceMinimum": 90},
            )
            if r.status_code == 200:
                new_ips = [line.strip() for line in r.text.splitlines() if line.strip()]
                for ip in new_ips:
                    _threat_ips.setdefault(ip, "AbuseIPDB Blacklist")
                logger.info(f"AbuseIPDB blacklist: {len(new_ips)} IPs merged into threat set")
                try:
                    await get_db().meta.update_one(
                        {"_id": "blacklist_last_fetch"},
                        {"$set": {"fetched_at": datetime.utcnow()}},
                        upsert=True,
                    )
                except Exception as e:
                    logger.warning(f"meta write failed: {e}")
            else:
                logger.warning(f"AbuseIPDB blacklist HTTP {r.status_code}")
    except Exception as e:
        logger.warning(f"AbuseIPDB blacklist fetch failed: {e}")
