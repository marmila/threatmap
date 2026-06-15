import geoip2.database
import geoip2.errors
import os
import logging

logger = logging.getLogger(__name__)
MMDB_PATH = os.getenv("GEOIP_DB_PATH", "/data/GeoLite2-City.mmdb")

_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        _reader = geoip2.database.Reader(MMDB_PATH)
    return _reader


def lookup(ip: str) -> dict | None:
    try:
        resp = _get_reader().city(ip)
        if not resp.location.latitude:
            return None
        return {
            "lat": resp.location.latitude,
            "lon": resp.location.longitude,
            "country": resp.country.name,
            "country_code": resp.country.iso_code,
            "city": resp.city.name,
        }
    except geoip2.errors.AddressNotFoundError:
        return None
    except Exception as e:
        logger.warning(f"GeoIP lookup failed for {ip}: {e}")
        return None
