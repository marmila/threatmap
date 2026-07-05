# ThreatMap — Roadmap

Backlog of planned improvements, grouped by area.

---

## Alerts

- **Telegram bot** — push notification on `cowrie.login.success`, `known_threat=true`, or `abuse_score >= 90`; backend webhook call after enrichment in `kafka_consumer.py`. No dashboard watching required.
- **Daily digest** — automated morning message: yesterday's event count, unique IPs, top country, known threat hits, AbuseIPDB quota used. Single Telegram message, cron-triggered or backend-scheduled.
- **Honeypot health alert** — if no events arrive in N minutes, send an alert; detects Fluent-Bit crash, WireGuard drop, or Kafka issue silently killing the pipeline.
- **Quota warning** — alert when AbuseIPDB checks exceed 800/day so you can react before hitting the wall.

---

## New honeypot protocols (OpenCanary)

Each needs: OCI ingress rule, iptables rule, OpenCanary config key, `_OPENCANARY_LOGTYPES` entry in `kafka_consumer.py`, arc color in `GlobeMap.jsx`.

- **VNC** (port 5900) — common on exposed home servers and Raspberry Pis
- **Elasticsearch** (port 9200) — data exfiltration probes, index deletion attacks
- **HTTP Proxy** (port 8080) — already in `_OPENCANARY_LOGTYPES` (logtype 4000), just needs enabling in OpenCanary config

---

## New honeypot software

- **Mailoney (SMTP)** — captures spam relay attempts and phishing infrastructure; completely different attacker population from SSH/HTTP; port 25
- **Dionaea** — captures actual malware binaries dropped during exploit attempts; stores samples with SHA256; correlate with Malware Bazaar
- **Cowrie fake filesystem + download capture** — enable Cowrie's fake filesystem so attackers can browse and "download" files; capture what they wget/curl during sessions (actual malware dropped on the honeypot)

---

## Infrastructure

- **Third VM in different region** (US East or Asia Pacific) — different attacker populations and timing patterns; adds a third arc origin on the globe; exposes geographic targeting differences
- **MongoDB backup to RustFS** — migrate daily cron backup (currently mongodump → SCP to honeypot) to S3-compatible RustFS for proper offsite storage
- **Backend HPA** — horizontal pod autoscaler on the backend during traffic spikes; enrichment queue backs up under high attack volume
- **AbuseIPDB threshold gating** — only call AbuseIPDB for IPs with >= 3 events in the last hour; cuts quota usage significantly without losing coverage on serious attackers

---

## Intelligence

- **Campaign detection** — group IPs by ASN + time window + credential patterns; surface "these 40 IPs are one scan campaign" vs random internet noise; store as `campaigns` collection in MongoDB
- **Attacker persistence tracking** — which IPs return day after day? Flag IPs seen on 3+ distinct calendar days as persistent; different threat model from one-shot scanners
- **Credential intelligence** — distinguish password spraying (same password, many IPs = coordinated campaign) from credential stuffing (many passwords, one IP = targeted brute force); expose in analytics
- **HTTP POST body capture** — OpenCanary HTTP honeypot logs path but not request body; capture login form payloads to see actual credentials being stuffed against the fake NAS
- **Password pattern grouping** — cluster top passwords by pattern (numeric-only, `admin`-variants, keyboard walks like `qwerty123`, default router passwords) instead of showing raw values
- **JA4 SSH fingerprinting** — Cowrie supports `ja4h` client fingerprinting; already appears in some events as `cowrie.direct-tcpip.ja4h`; parse and store the fingerprint to identify scanner tooling across IPs
- **GreyNoise integration** — classify IPs as internet background radiation (mass scanner) vs targeted attack; free tier available; reduces noise in the feed
- **Passive DNS** — on repeat attacker IPs, track hostname changes over time; a scanner that changes IPs but keeps the same hostname is still identifiable

---

## Globe & Visualization

- **Heatmap overlay** — attack density glow on countries, togglable layer on the 3D globe
- **Camera pan on login.success** — globe briefly auto-rotates to the origin country when a successful login is detected
- **Historical replay** — scrub a timeline slider and watch the arcs replay; useful for visualizing attack waves and campaign timing
- **Country drill-down** — click a country on the globe to see all attacks from it: top IPs, protocols, techniques, trend over time

---

## Analytics page

- **Attack wave detection** — show events-per-minute chart to surface burst attacks vs steady background noise
- **Returning attacker rate** — what % of today's IPs were also seen yesterday, last week? Tracks whether the attacker pool is rotating or persistent
- **Threat feed export** — `/api/blocklist` endpoint returning high-confidence IPs (abuse_score >= 90 OR known_threat=true) as a plain text list; usable directly in firewall rules or fail2ban

---

## Data quality

- **ASN enrichment** — add ASN number and name from a local database (ip2asn or MaxMind ASN mmdb, free); cheaper than Shodan for org-level classification
- **Hosting vs residential classification** — tag IPs as cloud/VPS/datacenter vs residential based on ASN type; most scanners are datacenter, targeted attacks sometimes come from residential proxies
- **Event deduplication** — cowrie.session.connect → cowrie.login.failed → cowrie.login.success from the same session is currently 3 events; optionally collapse into one enriched session record
