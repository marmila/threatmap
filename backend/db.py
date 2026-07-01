import logging
import motor.motor_asyncio
import os

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "threatmap")

_client = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        _client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
        _db = _client[MONGO_DB]
    return _db


async def close_db():
    global _client
    if _client:
        _client.close()


async def ensure_indexes():
    col = get_db().events
    # per-IP queries: _db_check_ip runs on every enriched event
    await col.create_index([("src_ip", 1), ("protocol", 1)])
    # time-range queries: hourly / daily stats pipelines
    await col.create_index([("timestamp", 1)])
    # event-type filtering: commands / http-paths / redis / vulns stats
    await col.create_index([("event_type", 1)])
    # TTL: drop events older than 90 days (_ts is a BSON Date set at insert time)
    await col.create_index([("_ts", 1)], expireAfterSeconds=90 * 24 * 3600)
    # ip_cache collection: AbuseIPDB + Shodan results persisted across restarts
    cache = get_db().ip_cache
    await cache.create_index([("ip", 1)], unique=True)
    await cache.create_index([("expires_at", 1)], expireAfterSeconds=0)
    logger.info("MongoDB indexes ensured")
