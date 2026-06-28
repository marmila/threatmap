"""One-shot script to backfill vuln_hint on existing MongoDB events.

Run inside the backend pod:
    kubectl -n threatmap exec -it deployment/threatmap-backend -- python backfill_vuln_hints.py
"""
import asyncio
import os
import re

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB", "threatmap")

VULN_SIGNATURES = [
    {"pattern": r"\$\{jndi:", "fields": ["path", "command"], "label": "Log4Shell", "cve": "CVE-2021-44228", "tier": "cve"},
    {"pattern": r"\(\)\s*\{\s*:;\s*\};", "fields": ["path", "command"], "label": "Shellshock", "cve": "CVE-2014-6271", "tier": "cve"},
    {"pattern": r"/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin\.php", "fields": ["path"], "label": "PHPUnit RCE", "cve": "CVE-2017-9841", "tier": "cve"},
    {"pattern": r"(?i)\.php\?[a-z0-9_]+=https?://", "fields": ["path"], "label": "PHP remote include", "cve": "CVE-2011-3379", "tier": "cve"},
    {"pattern": r"/wp-login\.php|/xmlrpc\.php", "fields": ["path"], "label": "WordPress brute force", "tier": "technique"},
    {"pattern": r"/\.git/|/\.env$|/\.htaccess|/\.htpasswd", "fields": ["path"], "label": "Sensitive file exposure", "tier": "technique"},
    {"pattern": r"/actuator/|/metrics$|/health$|/env$|/dump$", "fields": ["path"], "label": "Spring Actuator scan", "tier": "technique"},
    {"pattern": r"\b(CONFIG\s+GET|CONFIG\s+SET|SLAVEOF|DEBUG\s+SLEEP)\b", "fields": ["command"], "label": "Redis RCE attempt", "tier": "technique"},
    {"pattern": r"/(phpmyadmin|pma|adminer)", "fields": ["path"], "label": "DB admin panel scan", "tier": "technique"},
    {"pattern": r"/cgi-bin/", "fields": ["path"], "label": "CGI scanner", "tier": "technique"},
    {"pattern": r"(?i)(union\s+select|or\s+1=1|'--)", "fields": ["path", "command"], "label": "SQL injection probe", "tier": "technique"},
    {"pattern": r"(?i)<script|javascript:|onerror=", "fields": ["path", "command"], "label": "XSS probe", "tier": "technique"},
]


def _match_vuln_hint(path, command, password):
    candidate = {"path": path, "command": command, "password": password}
    for sig in VULN_SIGNATURES:
        for field in sig["fields"]:
            value = candidate.get(field)
            if value and re.search(sig["pattern"], value, re.IGNORECASE):
                return {"label": sig["label"], "cve": sig.get("cve"), "tier": sig["tier"]}
    return None


async def backfill():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]

    total = await db.events.count_documents({"vuln_hint": None})
    print(f"Events without vuln_hint: {total}")

    cursor = db.events.find(
        {
            "vuln_hint": None,
            "$or": [
                {"path": {"$nin": [None, ""]}},
                {"command": {"$nin": [None, ""]}},
            ],
        },
        {"_id": 1, "path": 1, "command": 1, "password": 1},
    )

    checked = 0
    matched = 0
    async for doc in cursor:
        hint = _match_vuln_hint(doc.get("path"), doc.get("command"), doc.get("password"))
        if hint:
            await db.events.update_one({"_id": doc["_id"]}, {"$set": {"vuln_hint": hint}})
            matched += 1
        checked += 1
        if checked % 1000 == 0:
            print(f"  {checked} checked, {matched} matched so far...")

    print(f"Done. Checked {checked} events, updated {matched} with vuln_hint.")
    client.close()


asyncio.run(backfill())
