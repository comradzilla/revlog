# Deployment Guide

Production deployment for RevLog (CEO Pipeline Changelog Dashboard).

---

## Target Architecture

```
DigitalOcean Droplet ($12/mo, 2GB RAM, Ubuntu 24.04)
  |
  +-- Nginx (reverse proxy, ports 80/443)
  |     |
  |     +-- Next.js (pm2, port 3000)
  |           |
  |           +-- TimescaleDB (Docker, port 5433)
  |
  +-- Certbot (SSL via Let's Encrypt)
```

Everything runs on a single server. The only external dependency is HubSpot CRM API.

---

## Prerequisites

- A DigitalOcean Droplet (or any VPS) with Ubuntu 24.04, at least 2GB RAM
- A domain name pointed to the server's IP address (A record)
- The HubSpot Private App token (with `crm.objects.deals.read` and `crm.objects.owners.read` scopes)

---

## First-Time Setup

The automated setup script handles everything. Run it as root on a fresh Droplet.

### Step 1: SSH into the server

```bash
ssh root@your-server-ip
```

### Step 2: Download and run the setup script

```bash
curl -fsSL https://raw.githubusercontent.com/comradzilla/revlog/main/ceo-dashboard/scripts/setup.sh | bash
```

Or clone first and run locally:

```bash
git clone https://github.com/comradzilla/revlog.git /opt/ceo-dashboard
cd /opt/ceo-dashboard/ceo-dashboard
bash scripts/setup.sh
```

### What the setup script does (9 steps):

1. **System updates** -- `apt-get update && upgrade`
2. **Install Docker** -- via `get.docker.com` (includes Docker Compose plugin)
3. **Install Node.js 22 LTS** -- via NodeSource
4. **Install pm2** -- `npm install -g pm2`
5. **Install Nginx and Certbot** -- `apt-get install nginx certbot python3-certbot-nginx`
6. **Clone repo** -- to `/opt/ceo-dashboard`
7. **Start TimescaleDB** -- `docker compose -f docker-compose.prod.yml up -d`, waits for `pg_isready`
8. **Build the app** -- `npm install && npm run build`, then `pm2 start ecosystem.config.js`
9. **Configure Nginx** -- copies `nginx/ceo-dashboard.conf` to `/etc/nginx/sites-available/`, enables it, removes default site

### Step 3: Configure environment

```bash
cd /opt/ceo-dashboard/ceo-dashboard
nano .env
```

Required variables:

```
HUBSPOT_ACCESS_TOKEN=pat-na1-XXXXXXXX
DATABASE_URL=postgresql://ceo:dashboard2024@localhost:5433/ceo_dashboard
CRON_SECRET=a-random-secret-string
PORT=3000
```

For production, change the database password:

```bash
# Update docker-compose.prod.yml POSTGRES_PASSWORD
# Update DATABASE_URL in .env to match
# Recreate the container: docker compose -f docker-compose.prod.yml down -v && docker compose -f docker-compose.prod.yml up -d
```

### Step 4: Set up the domain

Edit the Nginx config:

```bash
nano /etc/nginx/sites-available/ceo-dashboard
```

Replace `dashboard.yourdomain.com` with your actual domain.

### Step 5: Set up SSL

```bash
certbot --nginx -d dashboard.yourdomain.com
```

Certbot will:
- Obtain a Let's Encrypt certificate
- Modify the Nginx config to add SSL directives
- Set up auto-renewal via systemd timer

### Step 6: Restart and run first sync

```bash
pm2 restart ceo-dashboard
# Wait 30 seconds for the server to boot and the first incremental sync to run
# Then trigger a full sync to populate everything:
curl -X POST http://localhost:3000/api/sync
```

The full sync takes 60-90 seconds. After it completes, the dashboard will show all 3,022+ deals and their changelog history.

---

## Deploying Updates

### Option A: Deploy Script (recommended)

SSH into the server and run:

```bash
cd /opt/ceo-dashboard/ceo-dashboard
bash scripts/deploy.sh
```

What it does:
1. `git pull origin <current-branch>`
2. `npm install --production=false`
3. `npm run build`
4. `pm2 restart ceo-dashboard`

Takes about 30 seconds.

### Option B: SSH Alias from Laptop

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias deploy-dashboard='ssh root@your-server-ip "cd /opt/ceo-dashboard/ceo-dashboard && bash scripts/deploy.sh"'
```

Then just run `deploy-dashboard` from your laptop.

### Option C: GitHub Webhook Auto-Deploy

Set up a GitHub webhook that triggers on push to main:

1. Create a webhook endpoint on the server (a simple script that runs `deploy.sh`)
2. Configure the webhook in GitHub repo settings
3. Pushes to main automatically deploy

This is not yet implemented but is planned for post-launch.

---

## Production Docker Configuration

The production Docker Compose file (`docker-compose.prod.yml`) differs from development:

| Setting | Dev | Production |
|---------|-----|------------|
| Container name | ceo-dashboard-db | ceo-dashboard-timescaledb |
| Restart policy | (none) | always |
| Volume path | /home/postgres/pgdata/data | /var/lib/postgresql/data |
| SHM size | (default) | 256mb |
| Health check interval | 5s | 10s |
| Volume driver | (default) | local (explicit) |
| Password | hardcoded | `${POSTGRES_PASSWORD:-dashboard2024}` (env var with fallback) |

---

## pm2 Configuration

The `ecosystem.config.js` file:

```javascript
module.exports = {
  apps: [{
    name: "ceo-dashboard",
    script: "node_modules/.bin/next",
    args: "start",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
    },
    max_memory_restart: "512M",
    watch: false,
    instances: 1,
  }],
};
```

Key settings:
- **max_memory_restart: 512M** -- auto-restart if memory exceeds 512MB (prevents slow leaks)
- **instances: 1** -- single instance because the instrumentation hook scheduler must only run once
- **watch: false** -- no file watching in production

---

## Nginx Configuration

The Nginx config (`nginx/ceo-dashboard.conf`) sets up:

- Reverse proxy from port 80/443 to localhost:3000
- Gzip compression for text, CSS, JS, JSON, XML, SVG
- WebSocket upgrade headers (needed for HMR in dev, harmless in prod)
- Static asset caching for `/_next/static/` (immutable, 1 year) and `/public/` (1 day)
- SSL directives (commented out by default, enabled by Certbot)

---

## Monitoring

### Application Status

```bash
pm2 status
pm2 show ceo-dashboard
```

### Application Logs

```bash
pm2 logs ceo-dashboard         # Follow live logs
pm2 logs ceo-dashboard --lines 100  # Last 100 lines
```

Look for sync log lines:
```
[sync:incremental] Starting. Last sync: ...
[sync:incremental] 3 deals changed since last sync
[sync:incremental] Done. 3 deals, 1 changelog, 0 creations
[scheduler] Incremental: every 5 min | Full: daily at 2 AM
```

### Database Logs

```bash
docker logs ceo-dashboard-timescaledb
docker logs ceo-dashboard-timescaledb --tail 50
```

### Sync Status (via API)

```bash
curl http://localhost:3000/api/hubspot?type=sync-status | python3 -m json.tool
```

Returns timestamps for each sync tier. If `last_incremental_sync` is more than 10 minutes old, something is wrong.

### Disk Usage

```bash
# TimescaleDB volume size
docker system df -v | grep timescaledb

# Total disk
df -h
```

### Memory

```bash
pm2 show ceo-dashboard | grep memory
free -h
```

---

## Troubleshooting

### Database Connection Failed

**Symptom:** Dashboard shows "Database query failed. Has the sync been run?" or API returns 500.

**Check:**
```bash
docker ps | grep timescaledb
docker logs ceo-dashboard-timescaledb --tail 20
```

**Fix:**
```bash
docker compose -f docker-compose.prod.yml up -d
# Wait for health check
docker compose -f docker-compose.prod.yml exec -T timescaledb pg_isready -U ceo -d ceo_dashboard
```

### Sync Not Running

**Symptom:** `sync-status` shows old timestamps, dashboard data is stale.

**Check:**
```bash
pm2 logs ceo-dashboard --lines 50 | grep sync
pm2 logs ceo-dashboard --lines 50 | grep scheduler
```

**Fix:** The scheduler runs in the Node.js process. If pm2 restarted the app, the scheduler restarts automatically. If it is still not running:
```bash
pm2 restart ceo-dashboard
# Wait 30s for boot sync
curl http://localhost:3000/api/cron?tier=incremental
```

### HubSpot API Errors

**Symptom:** Sync logs show `HubSpot API error: 401` or `429`.

**401 (Unauthorized):** Token is invalid or expired. Generate a new Private App token in HubSpot and update `.env`.

**429 (Rate Limited):** Too many API calls. The sync already batches in groups of 5 to stay under the 100/10s limit. If hitting 429, wait and retry. The incremental sync is designed to use very few calls.

### Memory Issues

**Symptom:** pm2 shows frequent restarts, `max_memory_restart` triggered.

**Check:**
```bash
pm2 show ceo-dashboard | grep restart
```

**Fix:** The 512M limit is conservative. If the dataset grows significantly beyond 3,000 deals, increase `max_memory_restart` in `ecosystem.config.js` or upgrade the Droplet.

### TimescaleDB Disk Full

**Symptom:** Inserts fail, database becomes read-only.

**Fix:**
```bash
# Connect to database
docker compose -f docker-compose.prod.yml exec timescaledb psql -U ceo -d ceo_dashboard

# Check table sizes
SELECT hypertable_name, pg_size_pretty(hypertable_size(hypertable_name::regclass))
FROM timescaledb_information.hypertables;

# If pipeline_snapshots is large, compress old data:
SELECT add_compression_policy('pipeline_snapshots', INTERVAL '30 days');
SELECT add_compression_policy('deal_changelog', INTERVAL '90 days');
```

### Nginx 502 Bad Gateway

**Symptom:** Browser shows 502 error.

**Check:**
```bash
pm2 status  # Is the app running?
curl http://localhost:3000/  # Does the app respond locally?
```

**Fix:** If the app is not running, `pm2 start ecosystem.config.js`. If it is running but not responding, check logs for crash details.

---

## Backup

### Database Backup

```bash
docker compose -f docker-compose.prod.yml exec -T timescaledb \
  pg_dump -U ceo ceo_dashboard > backup-$(date +%Y%m%d).sql
```

### Restore

```bash
docker compose -f docker-compose.prod.yml exec -T timescaledb \
  psql -U ceo ceo_dashboard < backup-20260323.sql
```

Note: For TimescaleDB hypertables, use `pg_dump --format=plain --no-owner` for the most compatible dumps.
