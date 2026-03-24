# Project Status

**Read this first when starting a new session.** This is the source of truth for where the project stands, what is done, what is next, and every nuance you need to know.

Last updated: 2026-03-24

---

## Current State

| Item | Value |
|------|-------|
| Branch | `v2-pipeline-intelligence` (not merged to main yet) |
| Last version | v2.3.2 |
| Build | Passing (`npm run build` succeeds) |
| Database | ~3,022 deals, 5 pipelines, ~57 stage label mappings |
| HubSpot Hub ID | 3282655 |
| HubSpot API budget | 1M calls/day (currently using ~5K/day) |
| Sync | Three-tier: incremental every 5min (~2-3s), full daily 2AM (~60-90s), on-demand |
| Frontend | Client-side React dashboard with 2-minute auto-refresh |
| Server | DigitalOcean Droplet (Premium Intel, 2GB), live at app.revradar.io |
| Auth | Password login + httpOnly session cookie (7-day expiry) + middleware route protection |
| Mobile | Responsive "log mode" — changelog as hero, filter drawer, tabbed sidebar |

---

## What Is Done (Complete Feature List)

### Core Dashboard
- [x] Changelog feed with date grouping, 200 entries max
- [x] Pipeline Ledger — bank-statement view switchable from Changelog header dropdown
- [x] Quarter-scoped ledger — only shows transactions that impact the selected quarter's balance (UNION 3-branch SQL)
- [x] Close date move tracking — DATE IN / DATE OUT badges when deals enter/leave a quarter
- [x] Hidden count banner — "X out-of-quarter changes hidden" (dismissable)
- [x] 5 stat cards: Open Pipeline (filtered/all split), Changes Today, Changes (7d), Closed Won, Closed Lost
- [x] Open Pipeline card shows filtered value + global total as context
- [x] Win rate and average deal size on Closed Won card
- [x] Weighted pipeline value on Open Pipeline card (when no filters active)
- [x] Multi-select pipeline filter (toggle individual pipelines like quarters)
- [x] Growth Pipeline funnel card
- [x] Renewal Pipeline funnel card
- [x] Upsell pipeline card with inline pipeline toggle
- [x] Recently Changed deals sidebar (15 deals)
- [x] Net Movement bar (created vs won vs lost + amount grew vs shrank)
- [x] Stale Deals warning card (30+ days no activity in mid-funnel)
- [x] Every deal name links to HubSpot record

### Intelligence Features
- [x] Stage regression detection (REGR badge, red border)
- [x] Close date slip detection (SLIP badge, orange border)
- [x] Stale deal detection (30+ days, sorted by dollar value)
- [x] Time-in-stage badges (green <14d, amber 14-30d, red 30d+)
- [x] Deal creation events tracked and displayed
- [x] Owner name on every changelog entry
- [x] Owner reassignment tracking (OWNER tag)

### Filtering
- [x] Multi-select quarter filter (applied to changelog, won, lost, net movement, amounts)
- [x] Pipeline filter (ALL + per-pipeline buttons)
- [x] Deal type filter (ALL / UPSELL / NEW BIZ)
- [x] Changelog property filter tabs (all, stages, amounts, created, close date, owner)

### Themes
- [x] Terminal (default): deep navy, solid borders, card glow
- [x] Console: pure black, green monochrome, dashed borders, no glow, forced monospace
- [x] Light: white background, card shadows, darker accents

### Sync
- [x] Tier 1 Incremental: every 5 min, only changed deals, ~2-3s
- [x] Tier 2 Full: daily at 2 AM, all deals + owners + 7-day changelog window
- [x] Tier 3 On-Demand: POST /api/sync
- [x] Self-scheduling via instrumentation hook (no cron)
- [x] Deduplication on changelog inserts (deal_id + property + changed_at)
- [x] Pipeline snapshots with weighted values

### Authentication (v2.2)
- [x] Password login page (terminal-styled, supports all 3 themes)
- [x] httpOnly session cookie with HMAC-SHA256 signing (Web Crypto API, Edge runtime)
- [x] Next.js middleware route protection (redirects unauthenticated to /login)
- [x] 7-day session expiry with constant-time password comparison
- [x] Logout button in StatusBar
- [x] API routes return 401 JSON when unauthenticated
- [x] CRON_SECRET bypass bug fixed (undefined secret no longer skips auth)

### Mobile Responsive (v2.2)
- [x] MobileStatsSummary — compact single-line stats bar (pipeline, today, won, lost)
- [x] MobileFilterDrawer — slide-up drawer with all filters (quarter, deal type, pipeline, change type)
- [x] MobileSidebarTabs — tabbed Funnels/Stale/Recent view below changelog
- [x] ChangelogFeed two-line mobile rows (time + deal on line 1, tags + change on line 2)
- [x] Desktop layout completely unchanged
- [x] All 3 themes work on mobile

### Infrastructure
- [x] TimescaleDB schema with hypertables, indexes, views
- [x] 16 API endpoint types via /api/hubspot?type=
- [x] Docker Compose for dev and prod
- [x] pm2 ecosystem config
- [x] Nginx reverse proxy config
- [x] Setup script (first-time server provisioning)
- [x] Deploy script (pull + build + restart)
- [x] Updates/dev notes page at /updates
- [x] DigitalOcean deployment with SSL (Certbot) at app.revradar.io

### v2.3.2 Bug Fixes
- [x] Changes (7D) card: server-side count via `changes-count` endpoint (was client-side capped at 200)
- [x] Pipeline funnel sidebar (Growth/Renewal/Upsell): quarter-scoped via `close_date` filter
- [x] Stale deals: fallback to `created_at` when no changelog entries (fixes 999-day bug)
- [x] Playwright UI/UX audit: 67 passing tests across 11 suites (on `playwright-ui-audit` branch)

---

## What Is Next

### Immediate
- [ ] Set DASHBOARD_PASSWORD and SESSION_SECRET env vars on production server
- [ ] Deploy v2.2 to server (git pull + build + pm2 restart)
- [ ] Merge `v2-pipeline-intelligence` branch to `main`

### Short-term
- [ ] GitHub webhook for auto-deploy on push to main
- [ ] TimescaleDB compression policy for old changelog and snapshot data
- [ ] Error boundary component for graceful API failure handling

### Future ideas (not committed)
- [ ] Email/Slack alerts for regressions and stale deals
- [ ] Pipeline trend charts (data exists in pipeline_snapshots, needs frontend chart)
- [ ] Forecast model using weighted pipeline + historical win rates
- [ ] Deal velocity metrics (average time through each stage)
- [ ] Multi-user auth with role-based access

---

## Known Issues and Nuances

### deal_type Field Inconsistency

HubSpot stores deal type as either `existingbusiness` or `existing_business` (and `newbusiness` or `new_business`). This is a HubSpot data quality issue, not a code bug. The codebase handles both variants via `UPSELL_TYPES = ["existingbusiness", "existing_business"]` and uses `= ANY($1)` in SQL queries.

**Location:** `src/app/api/hubspot/route.ts` lines 5-6

### Archived Owner IDs

Some deals reference `hubspot_owner_id` values that do not exist in either the active or archived owners list. These show as "Unassigned" in the UI. This is expected for deals transferred from external systems or created by integrations.

The `deals.owner_id` column has no foreign key constraint to `owners.id` for this reason.

### Legacy Stage IDs

HubSpot property history for older deals contains legacy stage IDs like `closedwon`, `closedlost`, `contractsent`, `presentationscheduled`, `qualifiedtobuy`, `decisionmakerboughtin`, `appointmentscheduled`. These are from before Logicbroker customized their pipelines.

The `STAGE_LABELS` map in `src/lib/hubspot.ts` includes these legacy IDs so that historical changelog entries render correctly instead of showing raw IDs.

### Console Theme Text Brightening

The Console theme (data-theme="chromatic") required explicit text color overrides. Pure green-on-black was unreadable for body text. The solution was:
- `--text-primary: #e0e0e0` (bright gray for headings/values)
- `--text-secondary: #a0a0a0` (medium gray for body text)
- Accent colors remain `#33ff33` (green) for emphasis

### Upsell Deals Span Multiple Pipelines

Deals with type `existingbusiness` / `existing_business` exist in Growth, VS-Sales, and VS-Renewal pipelines. The Upsell card has its own pipeline toggle (separate from the global pipeline filter) to let the user focus on upsell deals within a specific pipeline or across all.

### Stage Regression Detection Edge Cases

- Stages without numeric prefixes (e.g., "BAU", "Renewed", "Closed Lost") default to -1 from `getStageNumberFromLabel()`, so they never trigger regression. This is correct behavior.
- Stage 0 (Closed Lost) is explicitly excluded from regression detection in `isStageRegression()` -- losing a deal is not a "pipeline regression."
- The regression check runs on stage labels, not IDs. If HubSpot stage labels are changed to remove numeric prefixes, regression detection will stop working.

### reactStrictMode Disabled

`next.config.ts` has `reactStrictMode: false`. This prevents React's development double-mount from causing duplicate API calls on every render. In production, strict mode has no effect, but it is left disabled for consistent dev/prod behavior.

### Auto-Refresh Stale Request Handling

The dashboard uses an `activeRequest` ref counter to prevent stale responses from overwriting newer data. When filters change, `activeRequest.current` increments, and any in-flight fetch checks `isStale()` before updating state. This prevents race conditions when rapidly changing filters.

### Sync Timezone

The full sync scheduler uses `msUntilNextHour(2)` which calculates based on `new Date()` -- the server's local timezone, not UTC. On a server set to UTC, the full sync runs at 2 AM UTC. On a laptop set to ET, it runs at 2 AM ET.

### HubSpot Rate Limits

HubSpot Private App tokens allow 100 API calls per 10 seconds and 1,000,000 per day. The sync batches property history calls in groups of 5 via `Promise.all` to stay under the burst limit. The incremental sync typically uses 1-10 calls. The full sync uses ~100-200 calls.

### Port 5433

TimescaleDB runs on port 5433 (not the Postgres default 5432) to avoid conflicts with any local Postgres installation. The Docker Compose maps container port 5432 to host port 5433. The DATABASE_URL must use port 5433.

---

## Design Decisions and Rationale

### Why TimescaleDB (not plain Postgres, not MongoDB, not SQLite)

TimescaleDB is Postgres with time-series superpowers. The changelog and pipeline snapshots are inherently time-series data. TimescaleDB provides:
- **Hypertables:** Automatic time-based partitioning. As the changelog grows to millions of rows, queries on recent data stay fast without manual partition management.
- **time_bucket():** Built-in function for daily/weekly/monthly aggregations, used by pipeline-trend and snapshot-history endpoints.
- **Compression:** Built-in compression policy for old data. A `SELECT add_compression_policy('deal_changelog', INTERVAL '90 days')` call halves storage for old changelog entries.
- **It is still Postgres:** Standard `pg` npm driver, standard SQL, standard `pg_dump` for backups. No new client library or query language to learn.

### Why Not Vercel

Vercel was the obvious deployment choice for a Next.js app, but it fails for this architecture:
- **Serverless kills timers:** The instrumentation hook uses `setInterval` for sync scheduling. Serverless functions cold-start and terminate, so timers would never fire.
- **Split infrastructure adds latency:** TimescaleDB would need to run on a separate service (e.g., Timescale Cloud, Supabase). Every API route call would cross the network to the database, adding 20-50ms of latency per query. On a single VPS, database queries take <1ms.
- **Cost:** Vercel Pro ($20/mo) + Timescale Cloud ($25+/mo) > DigitalOcean Droplet ($12/mo) that runs everything.

### Why Incremental Sync

In a 5-minute window, typically 0-5 deals out of 3,022 change. A full sync scans all 3,022 deals (30+ paginated API calls) even when nothing changed. The incremental sync uses a single HubSpot search call with `hs_lastmodifieddate GTE` filter, returning only changed deals. This reduces API usage by 99%+ per cycle and completes in 2-3 seconds instead of 60-90.

### Why Self-Scheduling (No External Cron)

- **Portable:** Works identically on a laptop (`npm run dev`), a Docker container, or a bare-metal server. No need to configure crontab, systemd timers, or a separate scheduler service.
- **Co-located with the app:** The sync schedule is defined in code (`src/instrumentation.ts`), version-controlled, and deploys automatically with the app.
- **Tradeoff:** If the Node.js process crashes and pm2 restarts it, the timers reset. But the first incremental sync runs 30 seconds after boot, so freshness is restored quickly.

### Why Client-Side Dashboard (Not Server Components)

The entire main page is `"use client"`. This was a deliberate choice:
- **All data comes from API routes:** The dashboard makes 12+ parallel fetch calls. Server components would serialize this into a single render, but client-side fetching allows parallel requests and progressive loading.
- **Interactive filters:** Quarter multi-select, pipeline filter, deal type filter, and changelog filter tabs all require client-side state management.
- **Auto-refresh:** The 2-minute `setInterval` refresh requires a client-side lifecycle.
- **Server components would still hit the API routes:** Using server components would not eliminate the API calls, it would just move them from the browser to the server. Since both run on the same machine, there is no latency benefit.

### Why Separate Sync from Reads

The sync engine (writes to DB) and the dashboard (reads from DB) are completely decoupled:
- **Dashboard never calls HubSpot:** Page loads read from Postgres. No HubSpot API calls on user requests means no rate limit risk from page views.
- **Sync runs independently:** Even if the dashboard is not being viewed, the sync keeps the database fresh.
- **Single source of truth:** The database is the canonical state. If HubSpot goes down temporarily, the dashboard still works with the last synced data.
- **Query flexibility:** SQL queries can do aggregations, joins, and time-based filtering that the HubSpot API cannot (e.g., "stale deals with no activity in 30+ days" requires a LEFT JOIN and HAVING clause).
