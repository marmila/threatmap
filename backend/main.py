import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from db import close_db, get_db, ensure_indexes, backfill_software_org
from kafka_consumer import start_kafka_consumer
from otx_poller import start_threat_poller

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_clients: set[WebSocket] = set()

_stats_cache: dict = {}
_STATS_TTL = 300.0


def _cache_get(key: str):
    entry = _stats_cache.get(key)
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    return None


def _cache_set(key: str, data):
    _stats_cache[key] = (data, time.monotonic() + _STATS_TTL)


async def _broadcast(event: dict):
    dead: set[WebSocket] = set()
    for ws in _clients:
        try:
            await ws.send_json(event)
        except Exception:
            dead.add(ws)
    _clients.difference_update(dead)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    asyncio.create_task(backfill_software_org())
    asyncio.create_task(start_kafka_consumer(_broadcast))
    asyncio.create_task(start_threat_poller())
    yield
    await close_db()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws/events")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    _clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        _clients.discard(websocket)


@app.get("/api/events/recent")
async def recent_events(limit: int = 200):
    db = get_db()
    events = await db.events.find(
        {}, {"_id": 0, "_ts": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return events


@app.get("/api/stats")
async def stats():
    if (cached := _cache_get("stats")) is not None:
        return cached
    db = get_db()
    total = await db.events.estimated_document_count()

    country_pipeline = [
        {"$group": {"_id": "$src_country", "count": {"$sum": 1}, "country_code": {"$first": "$src_country_code"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"country": "$_id", "count": 1, "country_code": 1, "_id": 0}},
    ]
    ip_pipeline = [
        {"$group": {
            "_id": "$src_ip",
            "count": {"$sum": 1},
            "country": {"$first": "$src_country"},
            "country_code": {"$first": "$src_country_code"},
            "known_threat": {"$max": "$known_threat"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"ip": "$_id", "count": 1, "country": 1, "country_code": 1, "known_threat": 1, "_id": 0}},
    ]
    protocol_pipeline = [
        {"$group": {"_id": "$protocol", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$project": {"protocol": "$_id", "count": 1, "_id": 0}},
    ]
    honeypot_pipeline = [
        {"$group": {
            "_id": {"honeypot": "$honeypot", "protocol": "$protocol"},
            "count": {"$sum": 1},
        }},
        {"$group": {
            "_id": "$_id.honeypot",
            "count": {"$sum": "$count"},
            "protocols": {"$push": {"protocol": "$_id.protocol", "count": "$count"}},
        }},
        {"$sort": {"count": -1}},
        {"$project": {"honeypot": "$_id", "count": 1, "protocols": 1, "_id": 0}},
    ]
    unique_ip_pipeline = [
        {"$group": {"_id": "$src_ip"}},
        {"$count": "count"},
    ]
    _noise = [
        "cowrie.session.connect", "cowrie.session.closed", "cowrie.session.params",
        "cowrie.client.kex", "cowrie.client.version", "cowrie.client.lex",
        "cowrie.client.size", "cowrie.client.var", "cowrie.client.fingerprint",
        "cowrie.log.closed", "cowrie.direct-tcpip.request",
        "cowrie.direct-tcpip.data", "cowrie.direct-tcpip.ja4h",
    ]
    event_type_pipeline = [
        {"$match": {"event_type": {"$nin": [None, ""] + _noise}}},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"event_type": "$_id", "count": 1, "_id": 0}},
    ]

    top_countries, top_ips, protocol_breakdown, honeypot_breakdown, event_type_breakdown, unique_ip_result = await asyncio.gather(
        db.events.aggregate(country_pipeline).to_list(10),
        db.events.aggregate(ip_pipeline).to_list(10),
        db.events.aggregate(protocol_pipeline).to_list(10),
        db.events.aggregate(honeypot_pipeline).to_list(20),
        db.events.aggregate(event_type_pipeline).to_list(10),
        db.events.aggregate(unique_ip_pipeline).to_list(1),
    )
    unique_ips = unique_ip_result[0]["count"] if unique_ip_result else 0
    result = {
        "total": total,
        "unique_ips": unique_ips,
        "top_countries": top_countries,
        "top_ips": top_ips,
        "protocol_breakdown": protocol_breakdown,
        "honeypot_breakdown": honeypot_breakdown,
        "event_type_breakdown": event_type_breakdown,
    }
    _cache_set("stats", result)
    return result


@app.get("/api/ip/{ip}/stats")
async def ip_stats(ip: str):
    db = get_db()
    pipeline = [
        {"$match": {"src_ip": ip}},
        {"$group": {
            "_id": "$event_type",
            "count": {"$sum": 1},
            "first_seen": {"$min": "$timestamp"},
            "last_seen": {"$max": "$timestamp"},
        }},
        {"$sort": {"count": -1}},
    ]
    vuln_pipeline = [
        {"$match": {"src_ip": ip, "vuln_hint": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": "$vuln_hint.label",
            "tier": {"$first": "$vuln_hint.tier"},
            "cve": {"$first": "$vuln_hint.cve"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"count": -1}},
        {"$project": {"label": "$_id", "tier": 1, "cve": 1, "count": 1, "_id": 0}},
    ]
    results, vuln_results = await asyncio.gather(
        db.events.aggregate(pipeline).to_list(20),
        db.events.aggregate(vuln_pipeline).to_list(10),
    )
    if not results:
        return {"total_attacks": 0, "first_seen": None, "last_seen": None, "event_breakdown": [], "vuln_hints": []}
    return {
        "total_attacks": sum(r["count"] for r in results),
        "first_seen": min(r["first_seen"] for r in results),
        "last_seen": max(r["last_seen"] for r in results),
        "event_breakdown": [{"event_type": r["_id"], "count": r["count"]} for r in results],
        "vuln_hints": vuln_results,
    }


@app.get("/api/stats/credentials")
async def credentials_stats():
    if (cached := _cache_get("credentials")) is not None:
        return cached
    db = get_db()
    username_pipeline = [
        {"$match": {"username": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$username", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"username": "$_id", "count": 1, "_id": 0}},
    ]
    password_pipeline = [
        {"$match": {"password": {"$nin": [None, ""], "$not": {"$regex": "^[0-9a-f]{40}$"}}}},
        {"$group": {"_id": "$password", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"password": "$_id", "count": 1, "_id": 0}},
    ]
    top_usernames, top_passwords = await asyncio.gather(
        db.events.aggregate(username_pipeline).to_list(10),
        db.events.aggregate(password_pipeline).to_list(10),
    )
    result = {"top_usernames": top_usernames, "top_passwords": top_passwords}
    _cache_set("credentials", result)
    return result


@app.get("/api/stats/commands")
async def commands_stats():
    if (cached := _cache_get("commands")) is not None:
        return cached
    db = get_db()
    pipeline = [
        {"$match": {"event_type": "cowrie.command.input", "command": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$command", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"command": "$_id", "count": 1, "_id": 0}},
    ]
    result = await db.events.aggregate(pipeline).to_list(10)
    _cache_set("commands", result)
    return result


@app.get("/api/stats/redis-commands")
async def redis_commands_stats():
    if (cached := _cache_get("redis-commands")) is not None:
        return cached
    db = get_db()
    pipeline = [
        {"$match": {"event_type": "opencanary.redis.command", "command": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$command", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15},
        {"$project": {"command": "$_id", "count": 1, "_id": 0}},
    ]
    result = await db.events.aggregate(pipeline).to_list(15)
    _cache_set("redis-commands", result)
    return result


@app.get("/api/stats/http-paths")
async def http_paths_stats():
    if (cached := _cache_get("http-paths")) is not None:
        return cached
    db = get_db()
    pipeline = [
        {"$match": {"event_type": "opencanary.http.request", "path": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$path", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15},
        {"$project": {"path": "$_id", "count": 1, "_id": 0}},
    ]
    result = await db.events.aggregate(pipeline).to_list(15)
    _cache_set("http-paths", result)
    return result


@app.get("/api/stats/daily")
async def daily_stats():
    if (cached := _cache_get("daily")) is not None:
        return cached
    db = get_db()
    since = datetime.now(timezone.utc) - timedelta(days=7)
    pipeline = [
        {"$match": {"_ts": {"$gte": since}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%dT00:00:00Z", "date": "$_ts"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
        {"$project": {"day": "$_id", "count": 1, "_id": 0}},
    ]
    result = await db.events.aggregate(pipeline).to_list(7)
    _cache_set("daily", result)
    return result


@app.get("/api/stats/orgs")
async def orgs_stats():
    if (cached := _cache_get("orgs")) is not None:
        return cached
    db = get_db()
    # Use the stored `org` field (set at insert time, backfilled at startup).
    # Avoids the old $project-before-$match pattern that forced a 400k COLLSCAN.
    pipeline = [
        {"$match": {"org": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$org", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"org": "$_id", "count": 1, "_id": 0}},
    ]
    result = await db.events.aggregate(pipeline).to_list(10)
    _cache_set("orgs", result)
    return result


@app.get("/api/stats/hourly")
async def hourly_stats():
    if (cached := _cache_get("hourly")) is not None:
        return cached
    db = get_db()
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    pipeline = [
        {"$match": {"_ts": {"$gte": since}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%dT%H:00:00Z", "date": "$_ts"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
        {"$project": {"hour": "$_id", "count": 1, "_id": 0}},
    ]
    result = await db.events.aggregate(pipeline).to_list(24)
    _cache_set("hourly", result)
    return result


@app.get("/api/stats/vulns")
async def vulns_stats():
    if (cached := _cache_get("vulns")) is not None:
        return cached
    db = get_db()
    pipeline = [
        {"$match": {"vuln_hint": {"$nin": [None, ""]}, "vuln_hint.label": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": "$vuln_hint.label",
            "count": {"$sum": 1},
            "cve": {"$first": "$vuln_hint.cve"},
            "tier": {"$first": "$vuln_hint.tier"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"label": "$_id", "count": 1, "cve": 1, "tier": 1, "_id": 0}},
    ]
    result = await db.events.aggregate(pipeline).to_list(10)
    _cache_set("vulns", result)
    return result


@app.get("/api/analytics/ips")
async def analytics_ips():
    if (cached := _cache_get("analytics_ips")) is not None:
        return cached
    db = get_db()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_naive = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    unique_today_pipeline = [
        {"$match": {"_ts": {"$gte": today_start}}},
        {"$group": {"_id": "$src_ip"}},
        {"$count": "count"},
    ]
    new_today_pipeline = [
        {"$group": {"_id": "$src_ip", "first_seen": {"$min": "$_ts"}}},
        {"$match": {"first_seen": {"$gte": today_start}}},
        {"$count": "count"},
    ]
    top_today_pipeline = [
        {"$match": {"_ts": {"$gte": today_start}}},
        {"$group": {
            "_id": "$src_ip",
            "count": {"$sum": 1},
            "country": {"$first": "$src_country"},
            "country_code": {"$first": "$src_country_code"},
            "known_threat": {"$max": "$known_threat"},
            "abuse_score": {"$max": "$abuse_score"},
            "protocols": {"$addToSet": "$protocol"},
            "org": {"$first": "$shodan_org"},
            "isp": {"$first": "$abuse_isp"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": 25},
        {"$project": {
            "ip": "$_id", "count": 1, "country": 1, "country_code": 1,
            "known_threat": 1, "abuse_score": 1, "protocols": 1,
            "org": 1, "isp": 1, "_id": 0,
        }},
    ]

    unique_r, new_r, top_today, abuse_today = await asyncio.gather(
        db.events.aggregate(unique_today_pipeline).to_list(1),
        db.events.aggregate(new_today_pipeline).to_list(1),
        db.events.aggregate(top_today_pipeline).to_list(25),
        db.ip_cache.count_documents({"abuse_cached_at": {"$gte": today_naive}}),
    )

    unique_ips_today = unique_r[0]["count"] if unique_r else 0
    new_ips_today = new_r[0]["count"] if new_r else 0

    result = {
        "unique_ips_today": unique_ips_today,
        "new_ips_today": new_ips_today,
        "repeat_ips_today": unique_ips_today - new_ips_today,
        "abuse_api_calls_today": abuse_today,
        "cache_hits_today": max(0, unique_ips_today - abuse_today),
        "top_ips_today": top_today,
    }
    _stats_cache["analytics_ips"] = (result, time.monotonic() + 300)
    return result


@app.get("/api/analytics/overview")
async def analytics_overview():
    if (cached := _cache_get("analytics_overview")) is not None:
        return cached
    db = get_db()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    month_start = today_start.replace(day=1)
    today_naive = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    (
        total_events,
        events_today,
        events_yesterday,
        known_threats_today,
        unique_ip_list,
        abuse_today,
        shodan_today,
        shodan_total,
        shodan_this_month,
        shodan_scans_this_month,
        threat_count,
        total_checked,
    ) = await asyncio.gather(
        db.events.estimated_document_count(),
        db.events.count_documents({"_ts": {"$gte": today_start}}),
        db.events.count_documents({"_ts": {"$gte": yesterday_start, "$lt": today_start}}),
        db.events.count_documents({"_ts": {"$gte": today_start}, "known_threat": True}),
        db.events.distinct("src_ip"),
        db.ip_cache.count_documents({"abuse_cached_at": {"$gte": today_naive}}),
        db.ip_cache.count_documents({"shodan_cached_at": {"$gte": today_naive}}),
        db.ip_cache.count_documents({"shodan_cached_at": {"$exists": True}}),
        db.ip_cache.count_documents({"shodan_cached_at": {"$gte": month_start}}),
        db.ip_cache.count_documents({"shodan_scanned_at": {"$gte": month_start}}),
        db.ip_cache.count_documents({"abuse_data.score": {"$gte": 50}}),
        db.ip_cache.count_documents({"abuse_cached_at": {"$exists": True}}),
    )
    unique_ips = len(unique_ip_list)
    threat_rate = round(threat_count / total_checked * 100, 1) if total_checked > 0 else 0.0
    result = {
        "total_events": total_events,
        "events_today": events_today,
        "events_yesterday": events_yesterday,
        "known_threats_today": known_threats_today,
        "unique_ips": unique_ips,
        "abuse_today": abuse_today,
        "shodan_today": shodan_today,
        "shodan_total": shodan_total,
        "shodan_this_month": shodan_this_month,
        "shodan_scans_this_month": shodan_scans_this_month,
        "threat_rate": threat_rate,
        "total_checked": total_checked,
    }
    _stats_cache["analytics_overview"] = (result, time.monotonic() + 300)
    return result


@app.get("/api/analytics/timeline")
async def analytics_timeline(days: int = 7):
    cache_key = f"analytics_timeline_{days}"
    if (cached := _cache_get(cache_key)) is not None:
        return cached
    db = get_db()
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"_ts": {"$gte": since}}},
        {"$group": {
            "_id": {"dow": {"$isoDayOfWeek": "$_ts"}, "hour": {"$hour": "$_ts"}},
            "count": {"$sum": 1},
        }},
    ]
    results = await db.events.aggregate(pipeline).to_list(days * 24)
    data = [{"dow": r["_id"]["dow"], "hour": r["_id"]["hour"], "count": r["count"]} for r in results]
    _stats_cache[cache_key] = (data, time.monotonic() + 300)
    return data


@app.get("/api/analytics/intelligence")
async def analytics_intelligence():
    if (cached := _cache_get("analytics_intelligence")) is not None:
        return cached
    db = get_db()
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    score_dist_pipeline = [
        {"$match": {"abuse_data": {"$exists": True}}},
        {"$bucket": {
            "groupBy": "$abuse_data.score",
            "boundaries": [0, 26, 51, 76, 101],
            "default": "other",
            "output": {"count": {"$sum": 1}},
        }},
    ]
    cve_pipeline = [
        {"$unwind": "$shodan_data.vulns"},
        {"$group": {"_id": "$shodan_data.vulns", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    ports_pipeline = [
        {"$unwind": "$shodan_data.ports"},
        {"$group": {"_id": "$shodan_data.ports", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15},
    ]
    tags_pipeline = [
        {"$unwind": "$shodan_data.tags"},
        {"$group": {"_id": "$shodan_data.tags", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    abuse_daily_pipeline = [
        {"$match": {"abuse_cached_at": {"$gte": seven_days_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$abuse_cached_at"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
        {"$limit": 7},
    ]
    shodan_daily_pipeline = [
        {"$match": {"shodan_cached_at": {"$gte": seven_days_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$shodan_cached_at"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
        {"$limit": 7},
    ]
    top_orgs_pipeline = [
        {"$match": {"shodan_org": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": "$shodan_org",
            "events": {"$sum": 1},
            "unique_ips": {"$addToSet": "$src_ip"},
        }},
        {"$project": {"org": "$_id", "events": 1, "unique_ips": {"$size": "$unique_ips"}, "_id": 0}},
        {"$sort": {"events": -1}},
        {"$limit": 15},
    ]

    (
        score_dist,
        top_cves,
        top_ports,
        top_tags,
        abuse_daily,
        shodan_daily,
        shodan_checked,
        shodan_with_data,
        top_orgs,
    ) = await asyncio.gather(
        db.ip_cache.aggregate(score_dist_pipeline).to_list(5),
        db.ip_cache.aggregate(cve_pipeline).to_list(10),
        db.ip_cache.aggregate(ports_pipeline).to_list(15),
        db.ip_cache.aggregate(tags_pipeline).to_list(10),
        db.ip_cache.aggregate(abuse_daily_pipeline).to_list(7),
        db.ip_cache.aggregate(shodan_daily_pipeline).to_list(7),
        db.ip_cache.count_documents({"shodan_cached_at": {"$exists": True}}),
        db.ip_cache.count_documents({"shodan_cached_at": {"$exists": True}, "shodan_data": {"$ne": {}}}),
        db.events.aggregate(top_orgs_pipeline).to_list(15),
    )

    bucket_labels = {0: "Clean (0–25)", 26: "Suspicious (26–50)", 51: "Malicious (51–75)", 76: "High Risk (76–100)"}
    score_formatted = sorted(
        [{"label": bucket_labels.get(b["_id"], "other"), "count": b["count"], "boundary": b["_id"]}
         for b in score_dist if isinstance(b["_id"], int)],
        key=lambda x: x["boundary"],
    )

    result = {
        "abuse_daily": [{"date": r["_id"], "count": r["count"]} for r in abuse_daily],
        "shodan_daily": [{"date": r["_id"], "count": r["count"]} for r in shodan_daily],
        "score_distribution": score_formatted,
        "top_cves": [{"cve": r["_id"], "count": r["count"]} for r in top_cves],
        "top_ports": [{"port": r["_id"], "count": r["count"]} for r in top_ports],
        "top_tags": [{"tag": r["_id"], "count": r["count"]} for r in top_tags],
        "shodan_coverage": {"has_data": shodan_with_data, "no_data": shodan_checked - shodan_with_data},
        "top_orgs": top_orgs,
    }
    _stats_cache["analytics_intelligence"] = (result, time.monotonic() + 300)
    return result


@app.get("/api/health/pipeline")
async def pipeline_health():
    if (cached := _cache_get("pipeline_health")) is not None:
        return cached
    db = get_db()
    now = datetime.utcnow()

    sensor_agg, protocol_agg = await asyncio.gather(
        db.events.aggregate([
            {"$group": {"_id": "$honeypot", "last_seen": {"$max": "$_ts"}}},
            {"$sort": {"_id": 1}},
        ]).to_list(length=None),
        db.events.aggregate([
            {"$match": {"protocol": {"$nin": [None, "unknown"]}}},
            {"$group": {"_id": "$protocol", "last_seen": {"$max": "$_ts"}}},
            {"$sort": {"_id": 1}},
        ]).to_list(length=None),
    )

    def _status(last_seen):
        if not last_seen:
            return "red"
        age = (now - last_seen).total_seconds()
        if age < 300:
            return "green"
        elif age < 1800:
            return "yellow"
        return "red"

    def _fmt(last_seen):
        if not last_seen:
            return "never"
        age = (now - last_seen).total_seconds()
        if age < 60:
            return f"{int(age)}s ago"
        elif age < 3600:
            return f"{int(age / 60)}m ago"
        return f"{int(age / 3600)}h ago"

    result = {
        "sensors": [
            {"name": s["_id"], "age_label": _fmt(s["last_seen"]), "status": _status(s["last_seen"])}
            for s in sensor_agg if s["_id"]
        ],
        "protocols": [
            {"name": p["_id"], "age_label": _fmt(p["last_seen"]), "status": _status(p["last_seen"])}
            for p in protocol_agg if p["_id"]
        ],
    }
    _stats_cache["pipeline_health"] = (result, time.monotonic() + 60)
    return result


@app.get("/api/analytics/daily-by-software")
async def analytics_daily_by_software(days: int = 10):
    cache_key = f"daily_by_software_{days}"
    if (cached := _cache_get(cache_key)) is not None:
        return cached
    db = get_db()
    since = datetime.now(timezone.utc) - timedelta(days=days)
    # {_ts, software} compound index makes this index-covered (no doc reads needed).
    # The software field is stored at insert time and backfilled at startup.
    pipeline = [
        {"$match": {"_ts": {"$gte": since}, "software": {"$in": ["cowrie", "opencanary"]}}},
        {"$group": {
            "_id": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$_ts"}},
                "software": "$software",
            },
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    results = await db.events.aggregate(pipeline).to_list(days * 10)
    by_date = {}
    for r in results:
        date = r["_id"]["date"]
        sw = r["_id"]["software"]
        if date not in by_date:
            by_date[date] = {}
        by_date[date][sw] = r["count"]
    data = [{"date": date, **counts} for date, counts in sorted(by_date.items())]
    result = {"data": data}
    _cache_set(cache_key, result)
    return result


@app.get("/api/analytics/daily-by-sensor")
async def analytics_daily_by_sensor(days: int = 10):
    cache_key = f"daily_by_sensor_{days}"
    if (cached := _cache_get(cache_key)) is not None:
        return cached
    db = get_db()
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"_ts": {"$gte": since}}},
        {"$group": {
            "_id": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$_ts"}},
                "honeypot": "$honeypot",
            },
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    results = await db.events.aggregate(pipeline).to_list(days * 10)
    by_date = {}
    sensors = set()
    for r in results:
        date = r["_id"]["date"]
        hp = r["_id"]["honeypot"]
        if not hp or hp == "unknown":
            continue
        if date not in by_date:
            by_date[date] = {}
        by_date[date][hp] = r["count"]
        sensors.add(hp)
    data = [{"date": date, **counts} for date, counts in sorted(by_date.items())]
    result = {"sensors": sorted(sensors), "data": data}
    _cache_set(cache_key, result)
    return result


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
