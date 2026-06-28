#!/usr/bin/env python3
"""Honeypot-side TTY log uploader.

Watches the Cowrie TTY log directory for newly completed session recordings
and uploads each one to the threatmap backend.

Cowrie names TTY logs by SHA256 hash of the content (no extension),
e.g. /var/lib/docker/volumes/cowrie-var/_data/lib/cowrie/tty/f20073be...

Required env vars:
  BACKEND_URL       - e.g. https://threatmap.homelab.marmilan.com
  TTY_UPLOAD_SECRET - must match backend TTY_UPLOAD_SECRET env var (optional)

Optional:
  TTY_LOG_DIR    - default /var/lib/docker/volumes/cowrie-var/_data/lib/cowrie/tty
  POLL_INTERVAL  - seconds between scans (default 15)
  STABLE_SECS    - file must not change for this long before uploading (default 10)
"""

import glob
import os
import sys
import time

import requests

BACKEND_URL   = os.getenv("BACKEND_URL", "").rstrip("/")
UPLOAD_SECRET = os.getenv("TTY_UPLOAD_SECRET", "")
TTY_LOG_DIR   = os.getenv("TTY_LOG_DIR", "/var/lib/docker/volumes/cowrie-var/_data/lib/cowrie/tty")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "15"))
STABLE_SECS   = int(os.getenv("STABLE_SECS", "10"))

if not BACKEND_URL:
    sys.exit("BACKEND_URL is required")


def upload(path: str) -> bool:
    # The filename IS the SHA256 hash — use it directly as the upload key
    sha = os.path.basename(path)
    try:
        with open(path, "rb") as f:
            data = f.read()
        if not data:
            return True  # skip empty files silently
        r = requests.post(
            f"{BACKEND_URL}/api/session/{sha}/ttylog",
            data=data,
            headers={
                "Content-Type": "application/octet-stream",
                "X-Upload-Secret": UPLOAD_SECRET,
            },
            timeout=30,
        )
        if r.status_code == 200:
            print(f"[ok] {sha[:16]}...", flush=True)
            return True
        print(f"[fail] {sha[:16]}...: HTTP {r.status_code}", flush=True)
    except Exception as e:
        print(f"[error] {sha[:16]}...: {e}", flush=True)
    return False


def main():
    uploaded: set[str] = set()
    print(f"Watching {TTY_LOG_DIR} → {BACKEND_URL}", flush=True)

    while True:
        now = time.time()
        for path in glob.glob(os.path.join(TTY_LOG_DIR, "*")):
            if not os.path.isfile(path) or path in uploaded:
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
