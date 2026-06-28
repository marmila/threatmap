"""Parser for Cowrie binary TTY log files.

Format:
  Header: b'COWRIETTYLOG' (12 bytes) + version uint16 big-endian (2 bytes)
  Records: secs float32 BE + usecs float32 BE + length uint32 BE + data bytes
  secs/usecs are absolute time since session start (not deltas).
"""
import base64
import struct

MAGIC = b"COWRIETTYLOG"
_HEADER = len(MAGIC) + 2  # magic + version


def parse(raw: bytes) -> list[dict]:
    if not raw.startswith(MAGIC):
        raise ValueError("Not a Cowrie TTY log file")

    offset = _HEADER
    frames = []
    while offset < len(raw):
        try:
            sec  = struct.unpack_from(">f", raw, offset)[0]; offset += 4
            usec = struct.unpack_from(">f", raw, offset)[0]; offset += 4
            n    = struct.unpack_from(">I", raw, offset)[0]; offset += 4
            data = raw[offset:offset + n];                   offset += n
            frames.append({
                "t": round(sec + usec, 4),
                "d": base64.b64encode(data).decode(),
            })
        except struct.error:
            break

    return frames
