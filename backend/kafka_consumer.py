import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Callable, Awaitable

from geoip import lookup
from otx_poller import is_known_threat, check_abuseipdb
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
                event = _enrich(msg.value)
                if event:
                    asyncio.run_coroutine_threadsafe(broadcast(event), loop)
                    asyncio.run_coroutine_threadsafe(_persist(event), loop)
        except Exception as e:
            logger.error(f"Kafka consumer failed: {e}, retrying in 10s")
            time.sleep(10)


def _enrich(raw: dict) -> dict | None:
    src_ip = raw.get("src_ip")
    if not src_ip:
        return None

    geo = lookup(src_ip)
    if not geo:
        return None

    abuse_threat, abuse_data = check_abuseipdb(src_ip)

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
        "duration": raw.get("duration"),
        "honeypot": raw.get("honeypot_host"),
        "known_threat": is_known_threat(src_ip) or abuse_threat,
        "abuse_score": abuse_data.get("score", 0),
        "abuse_total_reports": abuse_data.get("total_reports", 0),
        "abuse_distinct_users": abuse_data.get("distinct_users", 0),
        "abuse_last_reported": abuse_data.get("last_reported"),
        "abuse_isp": abuse_data.get("isp"),
        "abuse_usage_type": abuse_data.get("usage_type"),
        "abuse_is_tor": abuse_data.get("is_tor", False),
    }


async def _persist(event: dict):
    try:
        db = get_db()
        await db.events.insert_one({**event})
    except Exception as e:
        logger.warning(f"MongoDB write failed: {e}")
