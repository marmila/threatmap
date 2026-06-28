import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from db import close_db, get_db
from kafka_consumer import start_kafka_consumer
from otx_poller import start_threat_poller
from tty_parser import parse as parse_ttylog

TTY_UPLOAD_SECRET = os.getenv("TTY_UPLOAD_SECRET", "")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_clients: set[WebSocket] = set()


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
        {}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return events


@app.get("/api/stats")
async def stats():
    db = get_db()
    total = await db.events.count_documents({})

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
    return {
        "total": total,
        "unique_ips": unique_ips,
        "top_countries": top_countries,
        "top_ips": top_ips,
        "protocol_breakdown": protocol_breakdown,
        "honeypot_breakdown": honeypot_breakdown,
        "event_type_breakdown": event_type_breakdown,
    }


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
    return {"top_usernames": top_usernames, "top_passwords": top_passwords}


@app.get("/api/stats/commands")
async def commands_stats():
    db = get_db()
    pipeline = [
        {"$match": {"event_type": "cowrie.command.input", "command": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$command", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"command": "$_id", "count": 1, "_id": 0}},
    ]
    results = await db.events.aggregate(pipeline).to_list(10)
    return results


@app.get("/api/stats/redis-commands")
async def redis_commands_stats():
    db = get_db()
    pipeline = [
        {"$match": {"event_type": "opencanary.redis.command", "command": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$command", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15},
        {"$project": {"command": "$_id", "count": 1, "_id": 0}},
    ]
    results = await db.events.aggregate(pipeline).to_list(15)
    return results


@app.get("/api/stats/http-paths")
async def http_paths_stats():
    db = get_db()
    pipeline = [
        {"$match": {"event_type": "opencanary.http.request", "path": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$path", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15},
        {"$project": {"path": "$_id", "count": 1, "_id": 0}},
    ]
    results = await db.events.aggregate(pipeline).to_list(15)
    return results


@app.get("/api/stats/daily")
async def daily_stats():
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    pipeline = [
        {"$match": {"timestamp": {"$gte": since}}},
        {"$addFields": {"ts": {"$dateFromString": {"dateString": "$timestamp", "onError": None}}}},
        {"$match": {"ts": {"$ne": None}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%dT00:00:00Z", "date": "$ts"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
        {"$project": {"day": "$_id", "count": 1, "_id": 0}},
    ]
    results = await db.events.aggregate(pipeline).to_list(7)
    return results


@app.get("/api/stats/orgs")
async def orgs_stats():
    db = get_db()
    pipeline = [
        {"$project": {"org": {"$ifNull": ["$shodan_org", "$abuse_isp"]}}},
        {"$match": {"org": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$org", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"org": "$_id", "count": 1, "_id": 0}},
    ]
    results = await db.events.aggregate(pipeline).to_list(10)
    return results


@app.get("/api/stats/hourly")
async def hourly_stats():
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    pipeline = [
        {"$match": {"timestamp": {"$gte": since}}},
        {"$addFields": {"ts": {"$dateFromString": {"dateString": "$timestamp", "onError": None}}}},
        {"$match": {"ts": {"$ne": None}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%dT%H:00:00Z", "date": "$ts"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
        {"$project": {"hour": "$_id", "count": 1, "_id": 0}},
    ]
    results = await db.events.aggregate(pipeline).to_list(24)
    return results


@app.get("/api/stats/vulns")
async def vulns_stats():
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
    results = await db.events.aggregate(pipeline).to_list(10)
    return results


@app.post("/api/session/{session_id}/ttylog")
async def upload_ttylog(
    session_id: str,
    request: Request,
    x_upload_secret: str = Header(default=""),
):
    if TTY_UPLOAD_SECRET and x_upload_secret != TTY_UPLOAD_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty body")
    db = get_db()
    await db.tty_logs.replace_one(
        {"session_id": session_id},
        {
            "session_id": session_id,
            "raw": raw,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        },
        upsert=True,
    )
    return {"ok": True, "session_id": session_id}


@app.get("/api/session/{session_id}/frames")
async def session_frames(session_id: str):
    db = get_db()
    doc = await db.tty_logs.find_one({"session_id": session_id}, {"raw": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        return parse_ttylog(bytes(doc["raw"]))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
