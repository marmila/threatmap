#!/usr/bin/env python3
"""Honeypot-side TTY log uploader.

Watches /var/lib/cowrie/log/tty/ for newly completed Cowrie session logs
and uploads each one to the threatmap backend.

Required env vars:
  BACKEND_URL       - e.g. http://10.0.0.1:8000
  TTY_UPLOAD_SECRET - must match the backend TTY_UPLOAD_SECRET env var

Optional:
  TTY_LOG_DIR       - default /var/lib/cowrie/log/tty
  POLL_INTERVAL     - seconds between scans (default 15)
  STABLE_SECS       - file must not change for this long before uploading (default 10)
"""

import glob
import os
import sys
import time

import requests

BACKEND_URL    = os.getenv("BACKEND_URL", "").rstrip("/")
UPLOAD_SECRET  = os.getenv("TTY_UPLOAD_SECRET", "")
TTY_LOG_DIR    = os.getenv("TTY_LOG_DIR", "/var/lib/cowrie/log/tty")
POLL_INTERVAL  = int(os.getenv("POLL_INTERVAL", "15"))
STABLE_SECS    = int(os.getenv("STABLE_SECS", "10"))

if not BACKEND_URL:
    sys.exit("BACKEND_URL is required")


def extract_session(path: str) -> str:
    # Cowrie filename format: 20260628-143022-{session_id}.log
    name = os.path.basename(path).removesuffix(".log")
    parts = name.split("-")
    return parts[-1] if len(parts) >= 3 else name


def upload(path: str) -> bool:
    session_id = extract_session(path)
    try:
        with open(path, "rb") as f:
            data = f.read()
        r = requests.post(
            f"{BACKEND_URL}/api/session/{session_id}/ttylog",
            data=data,
            headers={
                "Content-Type": "application/octet-stream",
                "X-Upload-Secret": UPLOAD_SECRET,
            },
            timeout=30,
        )
        if r.status_code == 200:
            print(f"[ok] {session_id}", flush=True)
            return True
        print(f"[fail] {session_id}: HTTP {r.status_code}", flush=True)
    except Exception as e:
        print(f"[error] {session_id}: {e}", flush=True)
    return False


def main():
    uploaded: set[str] = set()
    print(f"Watching {TTY_LOG_DIR} → {BACKEND_URL}", flush=True)

    while True:
        now = time.time()
        for path in glob.glob(os.path.join(TTY_LOG_DIR, "*.log")):
            if path in uploaded:
                continue
            try:
                mtime = os.path.getmtime(path)
                if now - mtime >= STABLE_SECS:
                    if upload(path):
                        uploaded.add(path)
            except OSError:
                pass
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
