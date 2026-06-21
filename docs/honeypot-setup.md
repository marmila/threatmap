# Honeypot VM Setup Guide

![ThreatMap Architecture](threatmap-architecture.png)

Two Oracle Cloud VMs running Cowrie SSH + Telnet honeypots and OpenCanary (HTTP/FTP/MySQL), shipping attack events into the homelab via WireGuard → Fluentd → Kafka.

**VMs:**
- `honeypot-eu-01` — VM.Standard.E2.1.Micro, x86_64, Ubuntu 22.04, `eu-milan-1`
- `honeypot-eu-02` — VM.Standard.E2.1.Micro, x86_64, Ubuntu 22.04, `eu-milan-1`

**Homelab entry point:**
- WireGuard server: `vpnweb01` at `10.0.0.25`, public IP `<YOUR_PUBLIC_IP>`, UDP `51820`
- Fluentd LoadBalancer: `10.0.0.66` (reachable once VPN is up)

---

## Part 1 — WireGuard: Connect Oracle VMs to Homelab

### 1.1 On `vpnweb01` (SSH in at 10.0.0.25)

PiVPN generates a ready-to-use config for each client:

```bash
sudo pivpn add -n honeypot-eu-01
sudo pivpn add -n honeypot-eu-02
```

This creates two `.conf` files under `/home/<user>/configs/` (or `/etc/wireguard/configs/`).  
Find them with:

```bash
sudo pivpn -qr honeypot-eu-01   # shows QR or file path
ls /etc/wireguard/
```

Transfer each config to the corresponding Oracle VM:

```bash
# from vpnweb01, copy to Oracle VMs (adjust IPs and key path)
scp /etc/wireguard/configs/honeypot-eu-01.conf ubuntu@<s3marmilan-public-ip>:~/wg0.conf
scp /etc/wireguard/configs/honeypot-eu-02.conf ubuntu@<honeypot-eu-02-public-ip>:~/wg0.conf
```

After setup, verify peers are connected:

```bash
sudo wg show
```

---

### 1.2 On each Oracle VM

```bash
# Install WireGuard
sudo apt update && sudo apt install -y wireguard

# Move the config into place
sudo mv ~/wg0.conf /etc/wireguard/wg0.conf
sudo chmod 600 /etc/wireguard/wg0.conf

# Start and enable
sudo systemctl enable --now wg-quick@wg0

# Verify tunnel is up
sudo wg show
ping 10.0.0.1   # should reach homelab gateway
ping 10.0.0.66  # should reach Fluentd
```

The VPN IP assigned by PiVPN (e.g. `10.8.0.x`) will be in the wg0.conf.

---

## Part 2 — Oracle Cloud: Open Ports for Cowrie

By default Oracle Cloud blocks all inbound traffic except SSH.  
You need to open TCP ports 22 and 23 in the VCN Security List **and** on the VM's iptables.

### 2.1 Oracle Cloud Console — Security List

1. Go to **Networking → Virtual Cloud Networks → your VCN → Security Lists → Default Security List**
2. Add an **Ingress Rule** for SSH honeypot:
   - Source: `0.0.0.0/0`
   - Protocol: TCP
   - Destination Port: `22`
   - Description: `Cowrie SSH honeypot`
3. Add a second **Ingress Rule** for Telnet honeypot:
   - Source: `0.0.0.0/0`
   - Protocol: TCP
   - Destination Port: `23`
   - Description: `Cowrie Telnet honeypot`

> Port 22 may already be open. Port 23 is the new one to add.

### 2.2 VM iptables

Oracle Ubuntu images have iptables rules that override the security list. Add the rules:

```bash
# Allow inbound TCP 22 (Cowrie SSH)
sudo iptables -I INPUT -p tcp --dport 22 -j ACCEPT

# Allow inbound TCP 23 (Cowrie Telnet)
sudo iptables -I INPUT -p tcp --dport 23 -j ACCEPT

# Allow inbound TCP 2222 (real SSH after we move it)
sudo iptables -I INPUT -p tcp --dport 2222 -j ACCEPT

# Persist rules across reboots
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

---

## Part 3 — Move Real SSH Off Port 22

Cowrie needs to own port 22. Move the real SSH daemon to 2222.

```bash
# Edit SSH config
sudo sed -i 's/^#Port 22/Port 2222/' /etc/ssh/sshd_config
# If Port 22 is already uncommented:
sudo sed -i 's/^Port 22$/Port 2222/' /etc/ssh/sshd_config

# Verify
grep ^Port /etc/ssh/sshd_config

# Restart SSH — IMPORTANT: open a second terminal first to keep your current session alive
sudo systemctl restart ssh
```

> **Warning:** Before disconnecting, open a second SSH session on port 2222 to confirm it works:
> ```
> ssh -p 2222 ubuntu@<oracle-vm-ip>
> ```
> Only disconnect the port-22 session once port-2222 is confirmed working.

---

## Part 4 — Install Cowrie (Docker)

Docker is already installed on both VMs — use the official Cowrie image, no Python venv setup needed.

### 4.1 Create data directory

```bash
mkdir -p /home/ubuntu/cowrie/var/log/cowrie
mkdir -p /home/ubuntu/cowrie/var/lib/cowrie
```

### 4.2 iptables redirects: SSH and Telnet → Cowrie

Real SSH stays on 2222. External ports 22 and 23 get redirected to Cowrie.

```bash
# SSH: external 22 → Cowrie on 2223
sudo iptables -t nat -A PREROUTING -p tcp --dport 22 -j REDIRECT --to-port 2223

# Telnet: external 23 → Cowrie on 2323
sudo iptables -t nat -A PREROUTING -p tcp --dport 23 -j REDIRECT --to-port 2323

sudo netfilter-persistent save
```

Port layout:
- External `22` → iptables → Cowrie SSH listener on `2223`
- External `23` → iptables → Cowrie Telnet listener on `2323`
- Real SSH on `2222` (reachable via WireGuard or direct)

### 4.3 Create custom Cowrie config

`COWRIE_LISTEN_PORT` env var is **not** supported by the Docker image — the only reliable way to set the listen port is a mounted config file:

```bash
mkdir -p /home/ubuntu/cowrie-config
```

On **honeypot-eu-01**:
```bash
sudo tee /home/ubuntu/cowrie-config/cowrie.cfg > /dev/null << 'EOF'
[honeypot]
hostname = webserver-eu-01

[ssh]
listen_endpoints = tcp:2223:interface=0.0.0.0

[telnet]
enabled = true
listen_endpoints = tcp:2323:interface=0.0.0.0
EOF
```

On **honeypot-eu-02**:
```bash
sudo tee /home/ubuntu/cowrie-config/cowrie.cfg > /dev/null << 'EOF'
[honeypot]
hostname = webserver-eu-02

[ssh]
listen_endpoints = tcp:2223:interface=0.0.0.0

[telnet]
enabled = true
listen_endpoints = tcp:2323:interface=0.0.0.0
EOF
```

> `listen_endpoints` **must** be under the protocol section (`[ssh]` or `[telnet]`), not `[honeypot]` — putting it under `[honeypot]` is silently ignored.

### 4.4 Run Cowrie

Use `--network host` so Cowrie sees real attacker IPs (Docker NAT via `-p` would mask them as `172.17.0.1`):

```bash
# Create named volume (Docker manages permissions — avoids UID mismatch)
docker volume create cowrie-var

docker run -d \
  --name cowrie \
  --restart unless-stopped \
  --network host \
  -v cowrie-var:/cowrie/cowrie-git/var \
  -v /home/ubuntu/cowrie-config/cowrie.cfg:/cowrie/cowrie-git/etc/cowrie.cfg \
  cowrie/cowrie:latest
```

### 4.5 Verify Cowrie is catching attacks

```bash
# Check container is running
docker ps

# Watch live JSON events (real attacker IPs — attacks appear within minutes on a public IP)
tail -f /var/lib/docker/volumes/cowrie-var/_data/log/cowrie/cowrie.json | python3 -m json.tool

# Quick check
ssh -p 22 root@localhost   # type any password — Cowrie accepts it and logs the attempt
```

---

## Part 5 — Fluent-Bit: Ship Logs to Homelab Fluentd

Install on each Oracle VM and configure to tail Cowrie JSON logs → Fluentd over WireGuard.

### 5.1 Install Fluent-Bit

```bash
curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh
sudo systemctl enable fluent-bit
```

### 5.2 Configure

Edit `/etc/fluent-bit/fluent-bit.conf`:

```ini
[SERVICE]
    Flush           5
    Daemon          Off
    Log_Level       info
    Parsers_File    parsers.conf

[INPUT]
    Name              tail
    Path              /var/lib/docker/volumes/cowrie-var/_data/log/cowrie/cowrie.json
    Tag               cowrie
    Parser            json
    Read_from_Head    False
    Refresh_Interval  5

[FILTER]
    Name   record_modifier
    Match  cowrie
    Record honeypot_host ${HOSTNAME}
    Record honeypot_region eu-milan-1

[OUTPUT]
    Name          forward
    Match         cowrie
    Host          10.0.0.66
    Port          24224
    Shared_Key    K7vAfNh3lqfpzve
    tls           On
    tls.verify    Off
    time_as_integer On

[INPUT]
    Name              tail
    Path              /var/lib/docker/volumes/opencanary-logs/_data/opencanary.log
    Tag               opencanary
    Parser            json
    Read_from_Head    False
    Refresh_Interval  5

[FILTER]
    Name   record_modifier
    Match  opencanary
    Record honeypot_host ${HOSTNAME}
    Record honeypot_region eu-milan-1

[OUTPUT]
    Name          forward
    Match         opencanary
    Host          10.0.0.66
    Port          24224
    Shared_Key    K7vAfNh3lqfpzve
    tls           On
    tls.verify    Off
    time_as_integer On
```

> `10.0.0.66` is the Fluentd LoadBalancer, reachable via WireGuard.  
> `Shared_Key` is the Fluentd shared key — retrieve it with: `kubectl get secret fluentd-secrets -n fluent -o jsonpath='{.data.fluentd-shared-key}' | base64 -d`  
> `Parsers_File parsers.conf` is required in `[SERVICE]` — omitting it causes `parser 'json' is not registered` errors.  
> `tls On` + `tls.verify Off` is required — Fluentd rejects connections without TLS.

### 5.3 Start

```bash
sudo systemctl restart fluent-bit
sudo systemctl status fluent-bit

# Verify it's forwarding (watch for errors)
sudo journalctl -u fluent-bit -f
```

---

## Part 5b — OpenCanary (HTTP / FTP / MySQL honeypot)

OpenCanary runs alongside Cowrie on `honeypot-eu-01` and fakes a NAS login page (HTTP), FTP server, and MySQL server.

### Open ports in OCI Security List

Add ingress rules for TCP 80, 21, 3306, 6379 (source `0.0.0.0/0`).

### iptables

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 21 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 3306 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 6379 -j ACCEPT
sudo netfilter-persistent save
```

### Config file

```bash
sudo mkdir -p /etc/opencanaryd
sudo tee /etc/opencanaryd/opencanary.conf > /dev/null << 'EOF'
{
    "device.node_id": "opencanary-eu-01",
    "logger": {
        "class": "PyLogger",
        "kwargs": {
            "formatters": {
                "plain": {
                    "format": "%(message)s"
                }
            },
            "handlers": {
                "file": {
                    "class": "logging.FileHandler",
                    "filename": "/var/log/opencanary/opencanary.log"
                }
            }
        }
    },
    "ftp.enabled": true,
    "ftp.port": 21,
    "http.enabled": true,
    "http.port": 80,
    "http.skin": "nasLogin",
    "mysql.enabled": true,
    "mysql.port": 3306,
    "mysql.banner": "5.5.43-0ubuntu0.14.04.1",
    "redis.enabled": true,
    "redis.port": 6379
}
EOF
```

### Run

```bash
docker volume create opencanary-logs

docker run -d \
  --name opencanary \
  --restart unless-stopped \
  --network host \
  -v /etc/opencanaryd:/etc/opencanaryd \
  -v opencanary-logs:/var/log/opencanary \
  thinkst/opencanary:latest
```

### Verify

```bash
docker logs opencanary   # should show FTPFactory/HTTP/SQLFactory starting
ls /var/lib/docker/volumes/opencanary-logs/_data/   # opencanary.log should appear
```

> OpenCanary config must be at `/etc/opencanaryd/opencanary.conf` (not `/etc/opencanary.conf`).  
> `http.skin` must be `"nasLogin"` (not `"nasty"` — that skin doesn't exist).  
> MySQL banner must be the full string `"5.5.43-0ubuntu0.14.04.1"`.  
> Always use `docker stop && docker rm && docker run` (not `docker restart`) when changing config — restart keeps a stale PID file that blocks startup.

---

## Part 6 — Verify End-to-End Pipeline

From `vpnweb01` or any homelab node:

```bash
# Check WireGuard peers are connected
sudo wg show

# Check Fluentd is receiving cowrie.* tagged events
# (on a node that can reach Fluentd pod logs)
kubectl logs -n fluent -l app=fluentd --tail=50 | grep cowrie
```

From the Oracle VM:

```bash
# Manually test a fake SSH login attempt to your own Cowrie
ssh -p 22 root@localhost   # type any password, it will be logged

# Check it landed in the JSON log (named volume path)
tail -5 /var/lib/docker/volumes/cowrie-var/_data/log/cowrie/cowrie.json
```

---

## Repeat for Second VM

All steps above apply identically to both VMs. The only differences:
- Different VPN IPs (assigned by PiVPN)
- Different `HOSTNAME` (used as tag in Fluent-Bit)
- Different `honeypot_host` in the Fluent-Bit filter
- OpenCanary `device.node_id` must be `"opencanary-eu-02"` (not `opencanary-eu-01`)
- Cowrie `hostname` in `cowrie.cfg` must be `webserver-eu-02`

---

## Summary: Ports per VM

| Port | Protocol | Purpose |
|------|----------|---------|
| `21` | TCP | OpenCanary FTP |
| `22` | TCP | Cowrie SSH (via iptables redirect → 2223) |
| `23` | TCP | Cowrie Telnet (via iptables redirect → 2323) |
| `80` | TCP | OpenCanary HTTP (fake NAS login) |
| `2222` | TCP | Real SSH daemon |
| `2223` | TCP | Cowrie SSH listener (internal) |
| `2323` | TCP | Cowrie Telnet listener (internal) |
| `3306` | TCP | OpenCanary MySQL |
| `6379` | TCP | OpenCanary Redis |
| `51820` | UDP | WireGuard client (outbound to homelab) |

---

## Next Steps (after VMs are up)

1. **Fluentd config update** — add Cowrie tag routing → Kafka topic `attack-events`
2. **Kafka topic** — create `attack-events` via Strimzi KafkaTopic CR
3. **Python backend** — FastAPI + GeoLite2 + AlienVault OTX poller + WebSocket
4. **React frontend** — deck.gl globe + real-time WebSocket feed
5. **K8s deployment** — namespace, MongoDB, Deployments, HTTPRoute via FluxCD
