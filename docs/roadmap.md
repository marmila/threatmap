# ThreatMap — Roadmap

Backlog of planned improvements, grouped by area. No priority order within sections.

---

## Intelligence

- **Vulnerability/probe fingerprinting** — classify attack patterns into two tiers:
  - **CVE** (unambiguous payload match): Log4Shell `${jndi:`, Shellshock `() { :; };`, PHPUnit CVE-2017-9841 path, etc.
  - **Technique label** (too generic for a CVE): `WordPress brute force`, `Redis RCE attempt`, `Git repo exposure`, `Spring Actuator exposure`, …
  - Add `vuln_hint` field to enriched events in `kafka_consumer.py` via a static regex lookup table
  - New `GET /api/stats/vulns` endpoint + "PROBES DETECTED" leaderboard in the INTEL tab
  - Badge in the EventDetail modal when a match is found
  - Source for pattern → CVE mapping: GreyNoise tag taxonomy, NVD CVE descriptions, Rapid7 Project Sonar
- **HTTP POST body capture** — OpenCanary HTTP honeypot currently only logs path; capture request body to see payloads (e.g. login form stuffing, JSON injection attempts)
- **Password pattern grouping** — cluster top passwords by pattern (numeric-only, `admin`-variants, keyboard walks like `qwerty123`) instead of raw values

---

## Globe

- **Heatmap overlay** — attack density glow on countries, togglable layer on the 3D globe
- **Camera pan on login.success** — globe briefly auto-rotates to the origin country when a successful login is detected

---

## New honeypot protocols (OpenCanary)

Higher scan volume:
- **RDP** (port 3389)
- **SMB** (port 445)
- **MSSQL** (port 1433)

Medium value:
- **VNC** (port 5900)
- **Elasticsearch** (port 9200)
- **HTTP Proxy** (port 8080)

Each needs: OCI ingress rule, iptables redirect, OpenCanary config key, `_OPENCANARY_LOGTYPES` entry in `kafka_consumer.py`, arc color in `GlobeMap.jsx`.

---

## New honeypot software

- **Mailoney** — SMTP honeypot; captures spam relay attempts and phishing infrastructure — completely different attacker profile from SSH/HTTP
- **Dionaea** — captures actual malware samples dropped during exploit attempts; stores binaries with SHA256 hash

---

## Infrastructure

- **Third VM in a different region** (US East or Asia Pacific) — different attacker populations and timing patterns; would add a third arc origin point on the globe
- **Telegram / Pushover alert** — push notification on `cowrie.login.success` or any event where `known_threat=true`; backend webhook call in `kafka_consumer.py` after enrichment
