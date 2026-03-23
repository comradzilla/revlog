@AGENTS.md

# RevLog — CEO Pipeline Changelog Dashboard

> For Ashkan Naderi, CEO of Logicbroker. Connected to HubSpot Hub ID **3282655**.

## Quick Orientation

This is a Next.js 16.2.0 + TimescaleDB dashboard that tracks every pipeline change in HubSpot: stage movements, amount changes, deal creation, close date slips, owner reassignments. The dashboard **never hits HubSpot directly** — a sync engine writes to Postgres, the UI reads from Postgres.

**Read `STATUS.md` first** — it has current project state, what's done, what's next, and every known nuance.
**Read `ARCHITECTURE.md`** for deep technical details (schema, all 16 API endpoints, HubSpot mappings).

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── cron/route.ts         # Cron endpoint (?tier=incremental|full)
│   │   ├── hubspot/route.ts      # All 16 read endpoints (reads from Postgres)
│   │   └── sync/route.ts         # Manual sync trigger (POST)
│   ├── page.tsx                  # Main dashboard ("use client", 12+ parallel fetches)
│   ├── updates/page.tsx          # Product changelog + dev notes
│   ├── globals.css               # Tailwind v4 + CSS variables (3 themes)
│   └── layout.tsx                # Root layout (Geist fonts)
├── components/
│   ├── ChangelogFeed.tsx         # Console-log style changelog (5 property types)
│   ├── PipelineFunnel.tsx        # Stage funnel with inline filter support
│   ├── StatsCards.tsx            # 5 metric cards (pipeline, changes, won, lost)
│   ├── NetMovementBar.tsx        # Created/won/lost + amount grew/shrank
│   ├── StaleDealsList.tsx        # 30+ day idle deals warning
│   ├── RecentDeals.tsx           # Time-in-stage badges
│   ├── StatusBar.tsx             # Header with sync tier timestamps
│   └── ThemeToggle.tsx           # Terminal / Console / Light
├── lib/
│   ├── db.ts                     # Postgres connection pool
│   ├── hubspot.ts                # HubSpot API, stage labels, stage weights, pipelines
│   └── sync.ts                   # THREE-TIER SYNC (incremental + full + on-demand)
└── instrumentation.ts            # Auto-scheduler (5-min incremental, daily full at 2AM)
```

## Critical Constants (DO NOT lose these)

### Pipeline IDs
- **4207989** = Growth
- **4762460** = Renewal
- **128577389** = Partner Leads
- **875966339** = VS-Sales
- **875968058** = VS-Renewal

### Stage Probability Weights (for weighted pipeline)
- Prospecting = 10%, Qualification = 25%, Solutioning = 50%, Proposal = 70%, Negotiation = 90%

### Deal Type Normalization
- Upsell: `existingbusiness` OR `existing_business` (HubSpot inconsistency)
- New Business: `newbusiness` OR `new_business`

### Database
- TimescaleDB on port **5433** (not 5432, avoids local Postgres conflicts)
- Connection: `postgresql://ceo:dashboard2024@localhost:5433/ceo_dashboard`
- Tables: `owners`, `deals`, `deal_changelog` (hypertable), `pipeline_snapshots` (hypertable), `sync_meta`
- Properties tracked in changelog: `dealstage`, `amount`, `closedate`, `hubspot_owner_id`

## Sync Architecture (Three-Tier)

1. **Tier 1 — Incremental** (every 5 min): Uses `hs_lastmodifieddate GTE` filter to fetch only changed deals. Typically 0-5 deals, ~2-3 seconds.
2. **Tier 2 — Full** (daily 2 AM): Complete paginated scan of all ~3,022 deals + owners + 7-day changelog window. ~60-90 seconds.
3. **Tier 3 — On-Demand**: POST `/api/sync` for manual trigger.

Self-scheduling via `src/instrumentation.ts` — no external cron needed. HubSpot gives us 1M API calls/day; we use ~5K.

## Key Behaviors & Gotchas

- **Regression detection** uses numeric stage prefixes (01-, 02-, etc.). Stages without prefixes default to -1 and never trigger regression. If labels lose prefixes, detection breaks.
- **Upsell deals span 3 pipelines** (Growth, VS-Sales, VS-Renewal). The Upsell card has its own pipeline toggle, separate from the global filter.
- **Console theme** needed explicit text brightening — pure green-on-black was unreadable. Text primary is #e0e0e0, not #33ff33.
- **reactStrictMode is false** in next.config.ts to prevent double API calls in dev.
- **Auto-refresh** uses `activeRequest` ref counter to discard stale responses during rapid filter changes.
- **Full sync timezone**: Uses server local time for 2 AM scheduling, not UTC.
- **Port 5433**: Docker maps container 5432 → host 5433. DATABASE_URL must use 5433.
- **Owner FK**: `deals.owner_id` has no foreign key to `owners.id` because some owner IDs are from archived/external sources.

## Branch Strategy

- `main` — stable releases
- `v2-pipeline-intelligence` — current development branch (v2.0 + v2.1), not yet merged to main

## Commands

```bash
# Dev
npm run dev                                    # Start dev server (port 3000)
docker compose up -d                           # Start TimescaleDB

# Sync
curl http://localhost:3000/api/cron             # Incremental sync
curl http://localhost:3000/api/cron?tier=full   # Full sync
curl -X POST http://localhost:3000/api/sync     # Manual full sync

# Build & Deploy
npm run build                                  # Production build
scripts/deploy.sh                              # Pull + build + pm2 restart
```

## Rules for Editing

1. **Never call HubSpot from the dashboard/API routes.** All reads come from Postgres. Only `sync.ts` talks to HubSpot.
2. **Stage labels live in `src/lib/hubspot.ts`** in the `STAGE_LABELS` map (57 entries). Always update this when stages change.
3. **Changelog deduplication**: Inserts check `deal_id + property + changed_at` to prevent duplicates. Don't remove this.
4. **Update `STATUS.md`** when completing features or discovering new nuances.
5. **Update `/updates` page** when shipping a new version.
6. **Update this file** when adding significant new architecture, constants, or gotchas.
7. **Test with Playwright Preview** (via MCP) before committing — screenshot the dashboard and /updates page, check console for errors.

## Documentation Map

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — auto-loaded context for every session |
| `STATUS.md` | Current state, done/next lists, known issues, design decisions |
| `ARCHITECTURE.md` | Deep technical: schema, sync, API endpoints, HubSpot mappings |
| `DEPLOYMENT.md` | DigitalOcean production setup, deploy scripts, monitoring |
| `CHANGELOG.md` | Version history with files modified and decisions made |
| `README.md` | Project overview + quick start |
