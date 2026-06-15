import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Callable, Awaitable

from geoip import lookup
from otx_poller import is_known_threat
from db import get_db

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "kafka-kafka-bootstrap.kafka.svc.cluster.local:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "attack-events")
HOME_LAT = float(os.getenv("HOME_LAT", "45.4654"))
HOME_LON = float(os.getenv("HOME_LON", "9.1859"))


async def start_kafka_consumer(broadcast: Callable[[dict], Awaitable[None]]):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _consume_loop, broadcast, loop)


def _consume_loop(broadcast: Callable, loop: asyncio.AbstractEventLoop):
    try:
        from kafka import KafkaConsumer
        consumer = KafkaConsumer(
            KAFKA_TOPIC,
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="latest",
            group_id="threatmap-backend",
        )
        logger.info(f"Kafka consumer connected to {KAFKA_BOOTSTRAP}, topic={KAFKA_TOPIC}")
        for msg in consumer:
            event = _enrich(msg.value)
            if event:
                asyncio.run_coroutine_threadsafe(broadcast(event), loop)
                asyncio.run_coroutine_threadsafe(_persist(event), loop)
    except Exception as e:
        logger.error(f"Kafka consumer failed: {e}")


def _enrich(raw: dict) -> dict | None:
    src_ip = raw.get("src_ip")
    if not src_ip:
        return None

    geo = lookup(src_ip)
    if not geo:
        return None

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
        "honeypot": raw.get("honeypot_host"),
        "known_threat": is_known_threat(src_ip),
    }


async def _persist(event: dict):
    try:
        db = get_db()
        await db.events.insert_one({**event})
    except Exception as e:
        logger.warning(f"MongoDB write failed: {e}")
