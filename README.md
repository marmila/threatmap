# ThreatMap

Real-time global attack visualization — SSH honeypots on Oracle Cloud feed live attack events, enriched with geolocation and threat intelligence, and rendered as animated arcs on a 3D globe.

![Architecture](docs/threatmap-architecture.png)

---

## What it does

- Cowrie SSH honeypots on Oracle Cloud (eu-milan-1) capture real brute-force attacks from the internet
- Events stream over WireGuard VPN → Fluentd → Kafka
- Python backend enriches each event with MaxMind GeoLite2 (country, city, lat/lon) and cross-references AlienVault OTX + Abuse.ch threat feeds
- React frontend renders animated attack arcs on a 3D globe in real time via WebSocket
- Known threat IPs glow red, unknown attackers amber

---

## Stack

| Layer | Technology |
|---|---|
| Honeypots | Cowrie (Docker, `--network host`) on Oracle Cloud E2.1.Micro |
| Log shipping | Fluent-Bit → WireGuard VPN → Fluentd → Kafka (Strimzi) |
| Backend | Python 3.12, FastAPI, kafka-python, Motor (MongoDB), httpx |
| Geolocation | MaxMind GeoLite2 City (local `.mmdb`, no API calls) |
| Threat intel | AlienVault OTX + Abuse.ch ThreatFox + Feodo Tracker (free, polled every 5 min) |
| Frontend | React 18, react-globe.gl, Vite |
| Persistence | MongoDB |

---

## Repo structure

```
threatmap/
├── backend/
│   ├── main.py              FastAPI app, WebSocket broadcaster, REST endpoints
│   ├── kafka_consumer.py    Kafka consumer, GeoIP enrichment, MongoDB persistence
│   ├── geoip.py             MaxMind GeoLite2 wrapper
│   ├── otx_poller.py        AlienVault OTX + Abuse.ch threat feed poller
│   ├── db.py                Async MongoDB connection (Motor)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx              Root component, WebSocket state, history loader
│   │   ├── components/
│   │   │   ├── GlobeMap.jsx     react-globe.gl 3D globe with ArcLayer
│   │   │   └── StatsPanel.jsx   Live feed, top countries, total counter
│   │   └── hooks/
│   │       └── useWebSocket.js  Auto-reconnecting WebSocket hook
│   ├── index.html
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile
├── docs/
│   ├── honeypot-setup.md    Full VM setup guide (WireGuard, Cowrie, Fluent-Bit)
│   └── threatmap-architecture.png
└── .github/workflows/
    └── ci.yml               Build + push backend and frontend to GHCR on push to main
```

---

## Backend environment variables

| Variable | Default | Description |
|---|---|---|
| `KAFKA_BOOTSTRAP` | `kafka-kafka-bootstrap.kafka.svc.cluster.local:9092` | Kafka bootstrap servers |
| `KAFKA_TOPIC` | `attack-events` | Topic to consume |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB` | `threatmap` | Database name |
| `GEOIP_DB_PATH` | `/data/GeoLite2-City.mmdb` | Path to MaxMind mmdb file |
| `OTX_API_KEY` | — | AlienVault OTX API key |
| `HOME_LAT` | `45.4654` | Destination latitude (arc endpoint on the globe) |
| `HOME_LON` | `9.1859` | Destination longitude (arc endpoint on the globe) |

---

## Frontend environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_WS_URL` | auto-detected from `window.location` | WebSocket URL override |

---

## API

| Endpoint | Description |
|---|---|
| `GET /api/events/recent?limit=200` | Last N enriched attack events from MongoDB |
| `GET /api/stats` | Total event count + top 10 attacker countries |
| `WS /ws/events` | Live event stream (JSON, one event per message) |
| `GET /healthz` | Liveness probe |

---

## Honeypot setup

See [docs/honeypot-setup.md](docs/honeypot-setup.md) for the full guide covering:
- Oracle Cloud VM provisioning
- WireGuard VPN tunnel setup
- SSH port migration (real SSH → 2222, Cowrie → 2223 via iptables redirect)
- Cowrie Docker setup with named volume and custom config
- Fluent-Bit configuration (TLS + shared key auth to Fluentd)
- End-to-end pipeline verification

---

## Images

Published to GHCR on every push to `main`:

```
ghcr.io/marmila/threatmap-backend:latest
ghcr.io/marmila/threatmap-frontend:latest
```
