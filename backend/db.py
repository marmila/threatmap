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
    # {_ts, known_threat}: known_threats_today count avoids full doc scan
    await col.create_index([("_ts", 1), ("known_threat", 1)])
    # {_ts, software}: daily-by-software — index-covered aggregation (no doc reads)
    await col.create_index([("_ts", 1), ("software", 1)])
    # {event_type, command}: commands + redis-commands — index-covered aggregation
    await col.create_index([("event_type", 1), ("command", 1)])
    # {event_type, path}: http-paths — index-covered aggregation
    await col.create_index([("event_type", 1), ("path", 1)])
    # username / password: credentials queries — index-covered group (no doc reads)
    await col.create_index([("username", 1)])
    await col.create_index([("password", 1)])
    # org: orgs_stats — plain indexed lookup after backfill stores field at insert
    await col.create_index([("org", 1)])
    # shodan_org: top_orgs in analytics_intelligence
    await col.create_index([("shodan_org", 1)])
    # ip_cache collection: AbuseIPDB + Shodan results persisted across restarts
    cache = get_db().ip_cache
    await cache.create_index([("ip", 1)], unique=True)
    await cache.create_index([("expires_at", 1)], expireAfterSeconds=0)
    # analytics queries — all were doing COLLSCAN without these
    await cache.create_index([("abuse_cached_at", 1)])
    await cache.create_index([("shodan_cached_at", 1)])
    await cache.create_index([("shodan_scanned_at", 1)])
    await cache.create_index([("abuse_data.score", 1)])
    logger.info("MongoDB indexes ensured")


async def backfill_software_org():
    """One-time backfill: add software + org fields to existing events that lack them.

    Runs in background at startup. New events get the fields at insert time (kafka_consumer._persist).
    software: anchored regex on event_type uses the existing event_type B-tree index (range scan).
    org: pipeline update for $ifNull — only touches docs that have shodan_org or abuse_isp.
    """
    col = get_db().events
    r1 = await col.update_many(
        {"software": {"$exists": False}, "event_type": {"$regex": "^cowrie\\."}},
        {"$set": {"software": "cowrie"}},
    )
    r2 = await col.update_many(
        {"software": {"$exists": False}, "event_type": {"$regex": "^opencanary\\."}},
        {"$set": {"software": "opencanary"}},
    )
    r3 = await col.update_many(
        {
            "org": {"$exists": False},
            "$or": [
                {"shodan_org": {"$nin": [None, ""]}},
                {"abuse_isp": {"$nin": [None, ""]}},
            ],
        },
        [{"$set": {"org": {"$ifNull": ["$shodan_org", "$abuse_isp"]}}}],
    )
    logger.info(
        f"Backfill done: software={r1.modified_count + r2.modified_count} docs, "
        f"org={r3.modified_count} docs"
    )
