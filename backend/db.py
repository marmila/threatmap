import motor.motor_asyncio
import os

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
