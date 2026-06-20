import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from db import close_db, get_db
from kafka_consumer import start_kafka_consumer
from otx_poller import start_threat_poller

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
        {"$group": {"_id": "$src_country", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"country": "$_id", "count": 1, "_id": 0}},
    ]
    ip_pipeline = [
        {"$group": {
            "_id": "$src_ip",
            "count": {"$sum": 1},
            "country": {"$first": "$src_country"},
            "known_threat": {"$max": "$known_threat"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"ip": "$_id", "count": 1, "country": 1, "known_threat": 1, "_id": 0}},
    ]

    top_countries, top_ips = await asyncio.gather(
        db.events.aggregate(country_pipeline).to_list(10),
        db.events.aggregate(ip_pipeline).to_list(10),
    )
    return {"total": total, "top_countries": top_countries, "top_ips": top_ips}


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
    results = await db.events.aggregate(pipeline).to_list(20)
    if not results:
        return {"total_attacks": 0, "first_seen": None, "last_seen": None, "event_breakdown": []}
    return {
        "total_attacks": sum(r["count"] for r in results),
        "first_seen": min(r["first_seen"] for r in results),
        "last_seen": max(r["last_seen"] for r in results),
        "event_breakdown": [{"event_type": r["_id"], "count": r["count"]} for r in results],
    }


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
