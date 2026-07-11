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

    # Drop indexes that are now redundant or cause excess write amplification.
    # {timestamp_1}: string field replaced by _ts (BSON Date) in all queries.
    # {event_type_1}: single-field index fully covered by {event_type,command}
    #   and {event_type,path} compound indexes (MongoDB uses compound prefix).
    # {org_1}: orgs_stats uses $or on shodan_org/abuse_isp/org; single-field
    #   index doesn't help $or, and write cost is not worth it.
    for dead_index in ("timestamp_1", "event_type_1", "org_1"):
        try:
            await col.drop_index(dead_index)
            logger.info(f"Dropped redundant index: {dead_index}")
        except Exception:
            pass  # already absent

    # Create/ensure surviving indexes (idempotent).
    await col.create_index([("src_ip", 1), ("protocol", 1)])
    await col.create_index([("_ts", 1)], expireAfterSeconds=90 * 24 * 3600)
    await col.create_index([("_ts", 1), ("known_threat", 1)])
    await col.create_index([("_ts", 1), ("software", 1)])
    await col.create_index([("event_type", 1), ("command", 1)])
    await col.create_index([("event_type", 1), ("path", 1)])
    await col.create_index([("honeypot", 1), ("_ts", 1)])
    await col.create_index([("protocol", 1), ("_ts", 1)])
    await col.create_index([("username", 1)])
    await col.create_index([("password", 1)])
    await col.create_index([("shodan_org", 1)])

    cache = get_db().ip_cache
    await cache.create_index([("ip", 1)], unique=True)
    await cache.create_index([("expires_at", 1)], expireAfterSeconds=0)
    # Drop non-sparse versions — {$exists:true} queries on non-sparse indexes read
    # every document to verify the field (brutal on Longhorn network storage).
    for dead in ("abuse_cached_at_1", "shodan_cached_at_1", "shodan_scanned_at_1", "abuse_data.score_1"):
        try:
            await cache.drop_index(dead)
        except Exception:
            pass
    # Sparse: only index IPs where the field actually exists.
    # {field: {$exists:true}} count queries become fully covered — zero doc reads.
    await cache.create_index([("abuse_cached_at", 1)], sparse=True)
    await cache.create_index([("shodan_cached_at", 1)], sparse=True)
    await cache.create_index([("shodan_scanned_at", 1)], sparse=True)
    await cache.create_index([("abuse_data.score", 1)], sparse=True)

    logger.info("MongoDB indexes ensured")


async def backfill_software_org():
    """One-time backfill: add software + org fields to existing events that lack them.

    Runs in background at startup. New events get the fields at insert time.
    Anchored regex on event_type uses the compound index prefix for a B-tree range scan.
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
