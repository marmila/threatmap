import asyncio
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Callable, Awaitable

from geoip import lookup
from otx_poller import is_known_threat, check_abuseipdb, check_shodan, report_to_abuseipdb
from db import get_db

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "kafka-kafka-bootstrap.kafka.svc.cluster.local:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "attack-events")
KAFKA_SECURITY_PROTOCOL = os.getenv("KAFKA_SECURITY_PROTOCOL", "PLAINTEXT")
KAFKA_SASL_MECHANISM = os.getenv("KAFKA_SASL_MECHANISM", "")
KAFKA_USERNAME = os.getenv("KAFKA_USERNAME", "")
KAFKA_PASSWORD = os.getenv("KAFKA_PASSWORD", "")
HOME_LAT = float(os.getenv("HOME_LAT", "45.4654"))
HOME_LON = float(os.getenv("HOME_LON", "9.1859"))

_ip_timestamps: dict[str, list[float]] = {}  # ip -> recent hit timestamps for velocity detection

VULN_SIGNATURES = [
    # CVE tier — unambiguous exploit payload signatures
    {"pattern": r"\$\{jndi:", "fields": ["path", "command"], "label": "Log4Shell", "cve": "CVE-2021-44228", "tier": "cve"},
    {"pattern": r"\(\)\s*\{\s*:;\s*\};", "fields": ["path", "command"], "label": "Shellshock", "cve": "CVE-2014-6271", "tier": "cve"},
    {"pattern": r"/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin\.php", "fields": ["path"], "label": "PHPUnit RCE", "cve": "CVE-2017-9841", "tier": "cve"},
    {"pattern": r"(?i)\.php\?[a-z0-9_]+=https?://", "fields": ["path"], "label": "PHP remote include", "cve": "CVE-2011-3379", "tier": "cve"},
    # Technique tier — SSH persistence and backdoor
    {"pattern": r"authorized_keys", "fields": ["command"], "label": "SSH key injection", "tier": "technique"},
    {"pattern": r"chattr\s+-[ia]+\s+\.ssh", "fields": ["command"], "label": "SSH dir unlock (chattr)", "tier": "technique"},
    {"pattern": r"mdrfckr", "fields": ["command"], "label": "mdrfckr botnet", "tier": "technique"},
    # Technique tier — system recon (bot fingerprinting scripts)
    {"pattern": r"/proc/(meminfo|cpuinfo|version|uptime)", "fields": ["command"], "label": "System recon", "tier": "technique"},
    {"pattern": r"uname\s+-[a-z\s]+", "fields": ["command"], "label": "OS fingerprinting", "tier": "technique"},
    # Technique tier — C2 and beacon
    {"pattern": r"^echo\s+OK$", "fields": ["command"], "label": "C2 beacon check", "tier": "technique"},
    # Technique tier — Redis scanners
    {"pattern": r"^MGLNDD_", "fields": ["command"], "label": "Redis MGLNDD scanner", "tier": "technique"},
    {"pattern": r"\b(CONFIG\s+GET|CONFIG\s+SET|SLAVEOF|DEBUG\s+SLEEP)\b", "fields": ["command"], "label": "Redis RCE attempt", "tier": "technique"},
    # Technique tier — HTTP scanners
    {"pattern": r"/wp-login\.php|/xmlrpc\.php", "fields": ["path"], "label": "WordPress brute force", "tier": "technique"},
    {"pattern": r"/\.git/|/\.env$|/\.htaccess|/\.htpasswd", "fields": ["path"], "label": "Sensitive file exposure", "tier": "technique"},
    {"pattern": r"/actuator/|/metrics$|/health$|/env$|/dump$", "fields": ["path"], "label": "Spring Actuator scan", "tier": "technique"},
    {"pattern": r"/(phpmyadmin|pma|adminer)", "fields": ["path"], "label": "DB admin panel scan", "tier": "technique"},
    {"pattern": r"/cgi-bin/", "fields": ["path"], "label": "CGI scanner", "tier": "technique"},
    {"pattern": r"(?i)(union\s+select|or\s+1=1|'--)", "fields": ["path", "command"], "label": "SQL injection probe", "tier": "technique"},
    {"pattern": r"(?i)<script|javascript:|onerror=", "fields": ["path", "command"], "label": "XSS probe", "tier": "technique"},
]


_EVENT_TYPE_HINTS: dict[str, dict] = {
    "cowrie.login.failed":      {"label": "SSH brute force", "tier": "technique"},
    "cowrie.login.success":     {"label": "SSH credential compromise", "tier": "technique"},
    "cowrie.command.input":     {"label": "SSH command execution", "tier": "technique"},
    "cowrie.command.failed":    {"label": "SSH command execution", "tier": "technique"},
    "opencanary.mysql.login":   {"label": "MySQL brute force", "tier": "technique"},
    "opencanary.ftp.login":     {"label": "FTP brute force", "tier": "technique"},
    "opencanary.telnet.login":  {"label": "Telnet brute force", "tier": "technique"},
    "opencanary.ssh.login":     {"label": "SSH brute force", "tier": "technique"},
    "opencanary.http.request":  {"label": "HTTP scan", "tier": "technique"},
    "opencanary.redis.command": {"label": "Redis probe", "tier": "technique"},
}


def _match_vuln_hint(path: str | None, command: str | None, password: str | None) -> dict | None:
    candidate = {"path": path, "command": command, "password": password}
    for sig in VULN_SIGNATURES:
        for field in sig["fields"]:
            value = candidate.get(field)
            if value and re.search(sig["pattern"], value, re.IGNORECASE):
                return {"label": sig["label"], "cve": sig.get("cve"), "tier": sig["tier"]}
    return None


_OPENCANARY_LOGTYPES: dict[int, tuple[str, str]] = {
    2000: ("opencanary.ftp.login", "ftp"),
    3000: ("opencanary.http.request", "http"),
    3001: ("opencanary.http.request", "http"),  # 3001=credential POST, 3000=page hit
    4000: ("opencanary.http_proxy.request", "http"),
    4002: ("opencanary.ssh.login", "ssh"),
    6001: ("opencanary.telnet.login", "telnet"),
    8001: ("opencanary.mysql.login", "mysql"),
    17001: ("opencanary.redis.command", "redis"),
}


async def _db_check_ip(ip: str, protocol: str) -> tuple[int, bool]:
    """Returns (prev_event_count, is_multi_protocol). Queries MongoDB so it survives restarts."""
    db = get_db()
    prev_count, other_protocols = await asyncio.gather(
        db.events.count_documents({"src_ip": ip}),
        db.events.distinct("protocol", {"src_ip": ip, "protocol": {"$nin": [None, protocol]}}),
    )
    return prev_count, len(other_protocols) > 0


def _get_ip_history(ip: str, protocol: str, loop: asyncio.AbstractEventLoop) -> tuple[int, bool]:
    try:
        return asyncio.run_coroutine_threadsafe(
            _db_check_ip(ip, protocol), loop
        ).result(timeout=2.0)
    except Exception:
        return 0, False


def _check_velocity(ip: str) -> bool:
    now = time.time()
    cutoff = now - 60.0
    ts = _ip_timestamps.get(ip, [])
    ts = [t for t in ts if t > cutoff]
    ts.append(now)
    _ip_timestamps[ip] = ts
    return len(ts) > 10

_SKIP_EVENT_TYPES = {
    "cowrie.session.connect",
    "cowrie.session.params",
    "cowrie.session.closed",
    "cowrie.client.kex",
    "cowrie.client.lex",
    "cowrie.client.size",
    "cowrie.client.var",
    "cowrie.client.fingerprint",
    "cowrie.client.version",
    "cowrie.log.closed",
    "cowrie.direct-tcpip.request",
    "cowrie.direct-tcpip.data",
    "cowrie.direct-tcpip.ja4h",
}


async def start_kafka_consumer(broadcast: Callable[[dict], Awaitable[None]]):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _consume_loop, broadcast, loop)


def _consume_loop(broadcast: Callable, loop: asyncio.AbstractEventLoop):
    from kafka import KafkaConsumer

    consumer_kwargs = dict(
        bootstrap_servers=KAFKA_BOOTSTRAP,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        auto_offset_reset="latest",
        group_id="threatmap-backend",
        security_protocol=KAFKA_SECURITY_PROTOCOL,
        max_poll_interval_ms=600000,
        max_poll_records=10,
        session_timeout_ms=30000,
        heartbeat_interval_ms=10000,
    )
    if KAFKA_SASL_MECHANISM:
        consumer_kwargs["sasl_mechanism"] = KAFKA_SASL_MECHANISM
        consumer_kwargs["sasl_plain_username"] = KAFKA_USERNAME
        consumer_kwargs["sasl_plain_password"] = KAFKA_PASSWORD

    while True:
        try:
            consumer = KafkaConsumer(KAFKA_TOPIC, **consumer_kwargs)
            logger.info(f"Kafka consumer connected to {KAFKA_BOOTSTRAP}, topic={KAFKA_TOPIC}")
            for msg in consumer:
                event = _enrich(msg.value, loop)
                if event:
                    asyncio.run_coroutine_threadsafe(report_to_abuseipdb(event["src_ip"], event["event_type"]), loop)
                    asyncio.run_coroutine_threadsafe(broadcast(event), loop)
                    asyncio.run_coroutine_threadsafe(_persist(event), loop)
        except Exception as e:
            logger.error(f"Kafka consumer failed: {e}, retrying in 10s")
            time.sleep(10)


def _enrich(raw: dict, loop: asyncio.AbstractEventLoop) -> dict | None:
    if "logtype" in raw:
        return _enrich_opencanary(raw, loop)

    src_ip = raw.get("src_ip")
    if not src_ip:
        return None

    if raw.get("eventid") in _SKIP_EVENT_TYPES:
        return None

    geo = lookup(src_ip)
    if not geo:
        return None

    protocol = raw.get("protocol", "ssh")
    otx_threat, threat_source = is_known_threat(src_ip)
    abuse_threat, abuse_data = check_abuseipdb(src_ip)
    shodan_data = check_shodan(src_ip)
    prev_count, is_multi = _get_ip_history(src_ip, protocol, loop)
    is_hot = _check_velocity(src_ip)

    return {
        "timestamp": raw.get("timestamp", datetime.now(timezone.utc).isoformat()),
        "src_ip": src_ip,
        "src_lat": geo["lat"],
        "src_lon": geo["lon"],
        "src_country": geo["country"],
        "src_country_code": geo["country_code"],
        "src_city": geo.get("city"),
        "dst_lat": HOME_LAT,
        "dst_lon": HOME_LON,
        "event_type": raw.get("eventid", "ssh.login"),
        "username": raw.get("username"),
        "password": raw.get("password"),
        "command": raw.get("input"),
        "path": None,
        "duration": raw.get("duration"),
        "honeypot": raw.get("honeypot_host"),
        "protocol": protocol,
        "is_hot": is_hot,
        "known_threat": otx_threat or abuse_threat,
        "threat_source": threat_source if otx_threat else ("AbuseIPDB" if abuse_threat else None),
        "is_returning": prev_count > 0,
        "is_multi": is_multi,
        "previous_count": prev_count,
        "abuse_score": abuse_data.get("score", 0),
        "abuse_total_reports": abuse_data.get("total_reports", 0),
        "abuse_distinct_users": abuse_data.get("distinct_users", 0),
        "abuse_last_reported": abuse_data.get("last_reported"),
        "abuse_isp": abuse_data.get("isp"),
        "abuse_usage_type": abuse_data.get("usage_type"),
        "abuse_is_tor": abuse_data.get("is_tor", False),
        "shodan_ports": shodan_data.get("ports", []),
        "shodan_tags": shodan_data.get("tags", []),
        "shodan_vulns": shodan_data.get("vulns", []),
        "shodan_org": shodan_data.get("org"),
        "shodan_hostnames": shodan_data.get("hostnames", []),
        "shodan_domains": shodan_data.get("domains", []),
        "shodan_os": shodan_data.get("os"),
        "shodan_last_update": shodan_data.get("last_update"),
        "shodan_banners": shodan_data.get("banners", []),
        "shodan_http_titles": shodan_data.get("http_titles", []),
        "shodan_ssl_cns": shodan_data.get("ssl_cns", []),
        "vuln_hint": _match_vuln_hint(None, raw.get("input"), raw.get("password")) or _EVENT_TYPE_HINTS.get(raw.get("eventid", "")),
    }


def _enrich_opencanary(raw: dict, loop: asyncio.AbstractEventLoop) -> dict | None:
    src_ip = raw.get("src_host", "")
    if not src_ip:
        return None

    logtype = raw.get("logtype")
    event_type, protocol = _OPENCANARY_LOGTYPES.get(logtype, ("opencanary.unknown", "unknown"))

    logdata = raw.get("logdata") or {}
    username = logdata.get("USERNAME") or logdata.get("USER")
    password = logdata.get("PASSWORD")
    path = logdata.get("PATH") if protocol == "http" else None
    command = logdata.get("CMD") or logdata.get("COMMAND") if protocol == "redis" else None

    utc_time = raw.get("utc_time", "")
    try:
        ts = datetime.strptime(utc_time, "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=timezone.utc).isoformat()
    except (ValueError, TypeError):
        ts = datetime.now(timezone.utc).isoformat()

    geo = lookup(src_ip)
    if not geo:
        return None

    otx_threat, threat_source = is_known_threat(src_ip)
    abuse_threat, abuse_data = check_abuseipdb(src_ip)
    shodan_data = check_shodan(src_ip)
    prev_count, is_multi = _get_ip_history(src_ip, protocol, loop)
    is_hot = _check_velocity(src_ip)

    return {
        "timestamp": ts,
        "src_ip": src_ip,
        "src_lat": geo["lat"],
        "src_lon": geo["lon"],
        "src_country": geo["country"],
        "src_country_code": geo["country_code"],
        "src_city": geo.get("city"),
        "dst_lat": HOME_LAT,
        "dst_lon": HOME_LON,
        "event_type": event_type,
        "username": username,
        "password": password,
        "command": command,
        "path": path,
        "duration": None,
        "honeypot": raw.get("honeypot_host"),
        "protocol": protocol,
        "is_hot": is_hot,
        "known_threat": otx_threat or abuse_threat,
        "threat_source": threat_source if otx_threat else ("AbuseIPDB" if abuse_threat else None),
        "is_returning": prev_count > 0,
        "is_multi": is_multi,
        "previous_count": prev_count,
        "abuse_score": abuse_data.get("score", 0),
        "abuse_total_reports": abuse_data.get("total_reports", 0),
        "abuse_distinct_users": abuse_data.get("distinct_users", 0),
        "abuse_last_reported": abuse_data.get("last_reported"),
        "abuse_isp": abuse_data.get("isp"),
        "abuse_usage_type": abuse_data.get("usage_type"),
        "abuse_is_tor": abuse_data.get("is_tor", False),
        "shodan_ports": shodan_data.get("ports", []),
        "shodan_tags": shodan_data.get("tags", []),
        "shodan_vulns": shodan_data.get("vulns", []),
        "shodan_org": shodan_data.get("org"),
        "shodan_hostnames": shodan_data.get("hostnames", []),
        "shodan_domains": shodan_data.get("domains", []),
        "shodan_os": shodan_data.get("os"),
        "shodan_last_update": shodan_data.get("last_update"),
        "shodan_banners": shodan_data.get("banners", []),
        "shodan_http_titles": shodan_data.get("http_titles", []),
        "shodan_ssl_cns": shodan_data.get("ssl_cns", []),
        "vuln_hint": _match_vuln_hint(path, command, password) or _EVENT_TYPE_HINTS.get(event_type),
    }


async def _persist(event: dict):
    try:
        db = get_db()
        await db.events.insert_one({**event})
    except Exception as e:
        logger.warning(f"MongoDB write failed: {e}")


