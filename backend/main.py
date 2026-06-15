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
    pipeline = [
        {"$group": {"_id": "$src_country", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
        {"$project": {"country": "$_id", "count": 1, "_id": 0}},
    ]
    top_countries = await db.events.aggregate(pipeline).to_list(10)
    return {"total": total, "top_countries": top_countries}


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
