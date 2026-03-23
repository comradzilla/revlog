# RevLog

**Real-time pipeline changelog dashboard for HubSpot CRM**

RevLog gives Logicbroker's CEO a single-screen view of every pipeline change happening across HubSpot: stage movements, deal creation, amount changes, close date slips, owner reassignments, and regression detection. Think "git log" for your sales pipeline.

**Repo:** [comradzilla/revlog](https://github.com/comradzilla/revlog)
**HubSpot Hub ID:** 3282655
**Built for:** Ashkan Naderi, CEO, Logicbroker

<!-- Screenshot placeholder: replace with actual dashboard screenshot -->
<!-- ![Dashboard Screenshot](docs/screenshot.png) -->

---

## What It Does

- **Pipeline Changelog**: Every deal stage change, amount change, close date change, and owner reassignment recorded and displayed in a timeline grouped by date
- **Stage Regression Detection**: Flags deals that move backward in the pipeline (e.g., Negotiation to Qualification) with a red REGR badge
- **Close Date Slip Detection**: Highlights when close dates push out with an orange SLIP badge
- **Stale Deal Alerts**: Surfaces deals in Proposal/Negotiation/Solutioning with 30+ days of inactivity, sorted by dollar value
- **Weighted Pipeline**: Stage-based probability weighting (Prospecting 10%, Qualification 25%, Solutioning 50%, Proposal 70%, Negotiation 90%)
- **Net Movement Bar**: Pipeline created vs won vs lost, plus amount grew vs shrank
- **Win Rate and Average Deal Size**: Computed from Closed Won and Closed Lost counts
- **Time-in-Stage Badges**: Color-coded indicators (green <14d, amber 14-30d, red 30d+)
- **Multi-Pipeline View**: Growth, Renewal, Partner Leads, VS-Sales, VS-Renewal, plus a dedicated Upsell card with pipeline toggle
- **Three Themes**: Terminal (default, navy), Console (black + green monochrome), Light (white)
- **Quarter and Deal Type Filtering**: Multi-select quarters, ALL/UPSELL/NEW BIZ deal type filter

---

## Quick Start

### Prerequisites

- **Docker** (for TimescaleDB)
- **Node.js 22+** (LTS)
- **HubSpot Private App Token** with `crm.objects.deals.read` and `crm.objects.owners.read` scopes

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/comradzilla/revlog.git
cd revlog/ceo-dashboard

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local and add your HUBSPOT_ACCESS_TOKEN

# 3. Start TimescaleDB
docker-compose up -d

# 4. Install dependencies
npm install

# 5. Build the application
npm run build

# 6. Initialize the database
# Happens automatically on first Docker start via db/init.sql

# 7. Start the dev server
npm run dev

# 8. Run the first full sync to populate the database
curl -X POST http://localhost:3000/api/sync
```

The dashboard will be available at `http://localhost:3000`.

After the first full sync (~60-90s), the incremental sync scheduler kicks in automatically every 5 minutes via the Next.js instrumentation hook. No external cron needed.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.0 |
| Database | TimescaleDB (PostgreSQL) | Latest PG16 |
| CRM | HubSpot CRM API | v3 |
| Styling | Tailwind CSS | v4 |
| Runtime | React | 19.2.4 |
| Language | TypeScript | 5.x |
| Process Manager | pm2 | (production) |
| Reverse Proxy | Nginx | (production) |

---

## Architecture

Three-layer design: HubSpot CRM feeds a sync engine that writes to TimescaleDB, API routes read from TimescaleDB, and the React dashboard reads from API routes. The dashboard never hits HubSpot directly on page load.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full technical deep dive.

---

## Deployment

Production target is a DigitalOcean Droplet (Ubuntu 24.04, 2GB RAM, $12/mo) running TimescaleDB in Docker, Next.js via pm2, and Nginx as reverse proxy.

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for step-by-step instructions.

---

## Documentation

| File | Description |
|------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Database schema, sync architecture, API endpoints, HubSpot mappings, intelligence features |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment guide, server setup, monitoring, troubleshooting |
| [CHANGELOG.md](CHANGELOG.md) | Detailed version history with rationale and files modified |
| [STATUS.md](STATUS.md) | Current project status, known issues, design decisions -- read this first in a new session |
| [CLAUDE.md](CLAUDE.md) | Agent instructions |

---

## Environment Variables

```
HUBSPOT_ACCESS_TOKEN=   # HubSpot Private App token
DATABASE_URL=           # PostgreSQL connection string (default: postgresql://ceo:dashboard2024@localhost:5433/ceo_dashboard)
CRON_SECRET=            # Optional secret for /api/cron endpoint authentication
PORT=                   # Server port (default: 3000)
```

---

## License

Private. Internal use only.
