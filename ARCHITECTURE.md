# Architecture

Deep technical architecture documentation for RevLog (CEO Pipeline Changelog Dashboard).

---

## Data Flow

```
HubSpot CRM API (v3)
       |
       v
  Sync Engine (src/lib/sync.ts)
       |
       v
  TimescaleDB (Docker, port 5433)
       |
       v
  API Routes (src/app/api/hubspot/route.ts)
       |
       v
  React Dashboard (src/app/page.tsx, client-side)
```

Key principle: **the dashboard never hits HubSpot directly**. All user-facing reads come from Postgres. HubSpot API is only called during sync operations.

---

## Three-Layer Architecture

### Layer 1: Data Layer (TimescaleDB)

TimescaleDB is PostgreSQL with time-series extensions. It runs in Docker on port 5433 (not 5432, to avoid conflicts with any local Postgres).

**Connection string:** `postgresql://ceo:dashboard2024@localhost:5433/ceo_dashboard`

The database schema is initialized by `db/init.sql`, which is mounted into the Docker container at `/docker-entrypoint-initdb.d/` and runs automatically on first start.

### Layer 2: Sync Layer

The sync engine (`src/lib/sync.ts`) is the bridge between HubSpot and the database. It fetches data from the HubSpot CRM API and writes it to TimescaleDB. See the Sync Architecture section below for details.

### Layer 3: Presentation Layer

The dashboard is a single-page client-side React application using Next.js App Router. The main page (`src/app/page.tsx`) is marked `"use client"` and fetches all data from `/api/hubspot?type=...` endpoints. It auto-refreshes every 2 minutes via `setInterval`.

---

## Database Schema

### Table: `owners`

Stores HubSpot owner (sales rep) records, both active and archived.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | HubSpot owner ID |
| first_name | TEXT | First name |
| last_name | TEXT | Last name |
| email | TEXT | Email address |
| archived | BOOLEAN | Whether the owner is archived in HubSpot |
| synced_at | TIMESTAMPTZ | Last sync timestamp |

**Why archived owners:** Some deals still reference owners who have been deactivated in HubSpot. Without archived owner data, those deals show "Unassigned" instead of the actual owner name.

### Table: `deals`

Current state of every deal in HubSpot. This is a snapshot table -- it always reflects the latest known state.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | HubSpot deal ID |
| deal_name | TEXT | Deal name |
| pipeline | TEXT | Pipeline ID (e.g., "4207989") |
| pipeline_name | TEXT | Human-readable pipeline name (e.g., "Growth") |
| deal_stage | TEXT | Current stage ID |
| stage_name | TEXT | Human-readable stage name |
| amount | NUMERIC(14,2) | Deal value in dollars |
| close_date | TIMESTAMPTZ | Expected close date |
| owner_id | TEXT | HubSpot owner ID (FK to owners, not enforced) |
| created_at | TIMESTAMPTZ | When the deal was created in HubSpot |
| updated_at | TIMESTAMPTZ | Last modified in HubSpot (hs_lastmodifieddate) |
| stage_entered_at | TIMESTAMPTZ | When deal entered its current stage |
| deal_type | TEXT | Deal type (newbusiness, existingbusiness, etc.) |
| synced_at | TIMESTAMPTZ | Last sync timestamp |

**Indexes:**
- `idx_deals_pipeline` on pipeline -- used by pipeline-stats and dealtype-stats queries
- `idx_deals_stage` on deal_stage -- used by pipeline-stats grouping
- `idx_deals_updated` on updated_at DESC -- used by full sync to find recently modified deals
- `idx_deals_owner` on owner_id -- used by joins with owners table

### Table: `deal_changelog` (TimescaleDB Hypertable)

Every property change ever recorded, plus deal creation events. This is the core data that powers the changelog feed.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | Auto-incrementing ID |
| deal_id | TEXT | HubSpot deal ID |
| deal_name | TEXT | Deal name at time of change |
| pipeline | TEXT | Pipeline ID |
| pipeline_name | TEXT | Pipeline name |
| property | TEXT | Which property changed: dealstage, amount, closedate, hubspot_owner_id, or "created" |
| property_label | TEXT | Human label: "Deal Stage", "Deal Amount", "Close Date", "Deal Owner", "Deal Created" |
| old_value | TEXT | Previous raw value (null for creation events) |
| new_value | TEXT | New raw value |
| old_label | TEXT | Previous human-readable value |
| new_label | TEXT | New human-readable value |
| changed_at | TIMESTAMPTZ | When the change occurred (hypertable partition key) |
| source_type | TEXT | HubSpot source type (e.g., "CRM_UI", "INTEGRATION", "CREATION") |
| created_at | TIMESTAMPTZ | When this row was inserted |

**Hypertable partition key:** `changed_at` -- TimescaleDB automatically partitions this table by time, making time-range queries efficient.

**Indexes:**
- `idx_changelog_deal` on (deal_id, changed_at DESC) -- fetch changelog for a specific deal
- `idx_changelog_property` on (property, changed_at DESC) -- filter by change type
- `idx_changelog_pipeline` on (pipeline, changed_at DESC) -- filter by pipeline

**Deduplication:** Before inserting, the sync checks `WHERE NOT EXISTS (SELECT 1 FROM deal_changelog WHERE deal_id = $1 AND property = $5 AND changed_at = $11)`. This prevents duplicate entries when the same changelog data is fetched across multiple sync runs.

### Table: `pipeline_snapshots` (TimescaleDB Hypertable)

Point-in-time captures of pipeline state, grouped by pipeline and stage. Used for trend analysis.

| Column | Type | Description |
|--------|------|-------------|
| snapshot_time | TIMESTAMPTZ | When the snapshot was taken (hypertable partition key) |
| pipeline | TEXT | Pipeline ID |
| pipeline_name | TEXT | Pipeline name |
| stage | TEXT | Stage ID |
| stage_name | TEXT | Stage name |
| deal_count | INTEGER | Number of deals in this stage |
| total_value | NUMERIC(14,2) | Sum of deal amounts in this stage |
| weighted_value | NUMERIC(14,2) | Sum of (amount * stage_weight) for this stage |

**Index:** `idx_snapshots_pipeline` on (pipeline, snapshot_time DESC)

Snapshots are captured at the end of every sync (both incremental and full). The `time_bucket('1 day', snapshot_time)` function aggregates multiple intraday snapshots into daily summaries.

### Table: `sync_meta`

Key-value store for sync state tracking.

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT (PK) | Metadata key |
| value | TEXT | Metadata value (typically ISO timestamp) |
| updated_at | TIMESTAMPTZ | Last update |

**Keys used:**
- `last_incremental_sync` -- timestamp of last Tier 1 sync
- `last_full_sync` -- timestamp of last Tier 2 sync
- `last_changelog_sync` -- timestamp used as lower bound for changelog history fetch
- `last_creation_sync` -- timestamp used as lower bound for deal creation event detection

### Views

**`pipeline_summary`**: Current deal counts and values grouped by pipeline + stage. Reads from `deals` table.

**`recent_changelog`**: Changelog entries joined with deal owner names. Convenience view for direct SQL queries.

**`daily_pipeline`**: Daily aggregation of pipeline snapshots using `time_bucket('1 day', snapshot_time)`.

---

## Sync Architecture

### Overview

The sync system has three tiers, designed to balance freshness with API efficiency:

| Tier | Trigger | Frequency | Duration | API Calls |
|------|---------|-----------|----------|-----------|
| 1. Incremental | Automatic (instrumentation) | Every 5 minutes | ~2-3 seconds | 1-10 |
| 2. Full | Automatic (instrumentation) | Daily at 2 AM | ~60-90 seconds | ~100-200 |
| 3. On-Demand | Manual (POST /api/sync) | As needed | ~60-90 seconds | ~100-200 |

### Tier 1: Incremental Sync (`runIncrementalSync()`)

The workhorse. Runs every 5 minutes and only touches deals that changed since the last sync.

**How it works:**
1. Read `last_incremental_sync` from `sync_meta`
2. Query HubSpot `/crm/v3/objects/deals/search` with filter: `hs_lastmodifieddate GTE <last_sync_ms>`
3. Upsert changed deals into `deals` table
4. For each changed deal, fetch property history (`propertiesWithHistory=dealstage,amount,closedate,hubspot_owner_id`) and insert new changelog entries
5. Check for new deal creation events (`deals.created_at > last_sync`)
6. Capture pipeline snapshot from current `deals` table state
7. Update `last_incremental_sync` in `sync_meta`

**Why this is fast:** In a typical 5-minute window, 0-5 deals out of 3,022 have changed. The HubSpot GTE filter means we only fetch and process those few deals instead of scanning everything.

**Rate limiting:** Property history calls are batched in groups of 5 with `Promise.all` to stay within HubSpot's 100 calls/10 seconds limit.

### Tier 2: Full Sync (`runFullSync()`)

The safety net. Runs daily at 2 AM to catch anything incremental sync might miss.

**How it works:**
1. Sync owners (active + archived) from `/crm/v3/owners`
2. Paginated scan of ALL deals (100 per page via `/crm/v3/objects/deals/search`) -- upserts every deal
3. Fetch property history for all deals modified in the last 7 days (no artificial 50-deal limit)
4. Sync deal creation events
5. Capture pipeline snapshot
6. Update all sync timestamps

**Why 7-day window:** The incremental sync handles real-time changes. The full sync's 7-day window ensures that any changelog entries missed by incremental (e.g., server downtime, edge cases) are caught within the week.

### Tier 3: On-Demand Sync

Manual trigger via `POST /api/sync` (runs full sync) or `POST /api/sync?tier=incremental` (runs incremental). Used for initial bootstrap and debugging.

### Self-Scheduling (No External Cron)

The sync schedule is managed by `src/instrumentation.ts`, which is a Next.js instrumentation hook that runs once on server start.

```
register() runs when NEXT_RUNTIME === "nodejs":
  - setInterval(incremental, 5 * 60 * 1000)      -- every 5 min
  - setTimeout(incremental, 30_000)                -- 30s after boot
  - setTimeout(full, msUntilNextHour(2))           -- next 2 AM
    - then setInterval(full, 24 * 60 * 60 * 1000)  -- every 24h
```

The scheduler calls `http://localhost:${PORT}/api/cron?tier=...` internally. This approach was chosen over external cron because:
- Portable: works anywhere the app runs (laptop, server, container)
- No dependency on systemd, crontab, or external scheduler services
- Would break on Vercel (serverless kills long-lived timers) -- this is intentional, we deploy on a VPS

### Properties Tracked

The sync fetches property history for these 4 HubSpot deal properties:
- `dealstage` -- stage changes (core of the changelog)
- `amount` -- deal value changes
- `closedate` -- close date changes
- `hubspot_owner_id` -- owner reassignments

These are defined in the `TRACKED_HISTORY_PROPS` array in `src/lib/sync.ts`.

### Deal Properties Fetched

The following properties are fetched for each deal during sync (the `DEAL_PROPERTIES` array):
- `dealname`, `dealstage`, `amount`, `pipeline`, `hubspot_owner_id`
- `closedate`, `hs_lastmodifieddate`, `hs_v2_date_entered_current_stage`, `dealtype`

---

## HubSpot Mappings

**CRITICAL: These mappings are essential for the dashboard to display human-readable names. They are hardcoded in `src/lib/hubspot.ts` and must be kept in sync with HubSpot.**

### Pipeline IDs

| Pipeline ID | Name | Notes |
|-------------|------|-------|
| 4207989 | Growth | Primary new business pipeline |
| 4762460 | Renewal | Customer renewals |
| 128577389 | Partner Leads | Partner-sourced opportunities |
| 875966339 | VS - Sales | VS team new business |
| 875968058 | VS - Renewal | VS team renewals |

### Stage Weights (Probability)

Used for weighted pipeline calculation. Applied to Growth, VS-Sales, and Partner Leads pipelines.

| Stage | Weight | Growth ID | VS-Sales ID | Partner Leads ID |
|-------|--------|-----------|-------------|------------------|
| Prospecting / Prospect | 10% | 1166852615 | 1312827533 | 224212800 |
| Qualification / Exploration | 25% | 1166852616 | 1312827535 | 224212801 |
| Solutioning / Qualified Prospect | 50% | 1166852617 | 1312827528 | 224212802 |
| Proposal / SAO Confirmed | 70% | 1166852618 | 1312827529 | 227590167 |
| Negotiation | 90% | 1166852619 | 1312827530 | -- |

### Stage Label Mappings (57 total in hubspot.ts)

**Growth Pipeline:**
| Stage ID | Label |
|----------|-------|
| 1166852615 | 01 - Prospecting |
| 1166852616 | 02 - Qualification |
| 1166852617 | 03 - Solutioning |
| 1166852618 | 04 - Proposal |
| 1166852619 | 05 - Negotiation |
| 1166852620 | 06 - Closed Won |
| 14039891 | 00 - Closed Lost |

**Renewal Pipeline:**
| Stage ID | Label |
|----------|-------|
| 15424275 | 01 - Account Review |
| 15424273 | 02 - Validate |
| 56953899 | 03 - Propose |
| 15424276 | 04 - Negotiate |
| 15424278 | 05 - Closed Won / Renewed |
| 15424279 | 00 - Closed Lost / Churn |

**Renewal Pipeline (Alt IDs):**
| Stage ID | Label |
|----------|-------|
| 1312718091 | BAU |
| 1312718097 | Price Increase Notice |
| 1312718092 | Renewal Nudge |
| 1312718093 | Notice Nudge |
| 1312718094 | Negotiation |
| 1312718095 | Renewed |
| 1312718096 | Closed Lost |

**Partner Leads:**
| Stage ID | Label |
|----------|-------|
| 224212800 | 01 - Prospect |
| 224212801 | 02 - Exploration |
| 224212802 | 03 - Qualified Prospect |
| 227590167 | 04 - SAO Confirmed |
| 224212806 | 00 - Closed Lost |

**VS - Sales:**
| Stage ID | Label |
|----------|-------|
| 1312827533 | 01 - Prospecting |
| 1312827535 | 02 - Qualification |
| 1312827528 | 03 - Solutioning |
| 1312827529 | 04 - Proposal |
| 1312827530 | 05 - Negotiation |
| 1312827531 | Closed Won |
| 1312827532 | Closed Lost |

**Legacy Stage IDs (from property history):**
| Stage ID | Label |
|----------|-------|
| closedwon | Closed Won |
| closedlost | Closed Lost |
| contractsent | Contract Sent |
| presentationscheduled | Presentation Scheduled |
| qualifiedtobuy | Qualified to Buy |
| decisionmakerboughtin | Decision Maker Bought In |
| appointmentscheduled | Appointment Scheduled |

**Why legacy IDs exist:** When HubSpot returns property history, older changes may reference stage IDs from before the pipelines were customized. These legacy mappings ensure those historical entries render correctly.

### Deal Type Normalization

HubSpot's `dealtype` field has inconsistent values across deals:

| Raw Value | Normalized Category |
|-----------|-------------------|
| `existingbusiness` | Upsell |
| `existing_business` | Upsell |
| `newbusiness` | New Business |
| `new_business` | New Business |

The `UPSELL_TYPES` and `NEW_BIZ_TYPES` arrays in the API route handle both variants. The deal type filter in the UI uses `= ANY($1)` SQL syntax with both values.

---

## API Endpoints

All endpoints are served from `GET /api/hubspot` with a `type` query parameter. The route file is `src/app/api/hubspot/route.ts`.

### `?type=changelog`

Returns the full changelog feed.

**Query params:**
- `limit` (default: 200) -- max entries to return
- `quarter` -- e.g., "2026-Q1" or "2026-Q1,2025-Q4" for multi-select
- `pipeline` -- pipeline ID filter (e.g., "4207989")
- `dealType` -- "upsell", "newbusiness", or "all"

**Returns:** `{ changelogs: ChangelogEntry[] }` where each entry includes `isRegression` boolean computed by comparing numeric stage prefixes.

### `?type=recently-changed`

Returns deals with the most recent changelog activity (one entry per deal).

**Query params:** `limit` (default: 15), `quarter`, `pipeline`, `dealType`

**Returns:** `{ deals: DealEntry[] }` with `changeType` field indicating most recent change property.

### `?type=pipeline-stats`

Stage breakdown for a specific pipeline.

**Query params:** `pipeline` (default: "4207989" = Growth)

**Returns:** `{ stats: StageData[], totalCount: number, totalValue: number }`

### `?type=dealtype-stats`

Stage breakdown filtered by deal type (upsell or new business).

**Query params:** `dealType` (default: "upsell"), `dtPipeline` (optional pipeline filter)

**Returns:** `{ stats: StageData[], totalCount, totalValue, pipelines: PipelineInfo[] }`

### `?type=pipeline-value`

Total open pipeline value across all pipelines (excludes closed/renewed/churn stages).

**Returns:** `{ totalValue: number, count: number }`

### `?type=weighted-pipeline`

Raw and weighted pipeline values using stage probability weights.

**Returns:** `{ rawValue: number, weightedValue: number }`

### `?type=pipeline-list`

List of all pipelines with deal counts.

**Returns:** `{ pipelines: { pipeline, pipeline_name, deal_count }[] }`

### `?type=closed-won`

Closed Won deals for the selected period.

**Query params:** `quarter` (defaults to current month if not specified)

**Returns:** `{ totalValue: number, count: number }`

### `?type=closed-lost`

Closed Lost deals for the selected period.

**Query params:** `quarter` (defaults to current month if not specified)

**Returns:** `{ totalValue: number, count: number }`

### `?type=net-movement`

Pipeline in/out flow: deals created, won, and lost.

**Query params:** `quarter` (defaults to current month if not specified)

**Returns:** `{ created: {count, value}, won: {count, value}, lost: {count, value}, net: number }`

### `?type=amount-movement`

Deal value changes: amounts that grew vs shrank.

**Query params:** `quarter`

**Returns:** `{ grew: number, shrank: number, net: number }`

### `?type=stale-deals`

Deals with no stage/amount activity in 30+ days that are in mid-funnel stages.

**Returns:** `{ deals: StaleDeal[], count: number, totalValue: number }`

Targets stages matching: proposal, negotiation, solutioning, qualification, propose, negotiate (case-insensitive). Sorted by amount descending. Limited to 20 results.

### `?type=deal-types`

Distinct deal types in the database with counts.

**Returns:** `{ dealTypes: { deal_type, count }[] }`

### `?type=sync-status`

Sync metadata from `sync_meta` table.

**Returns:** `{ meta: { key, value, updated_at }[] }`

### `?type=pipeline-trend`

Daily pipeline trend data from snapshots.

**Query params:** `days` (default: 30)

**Returns:** `{ trend: { day, pipeline_name, total_deals, total_value }[] }`

Uses TimescaleDB `time_bucket('1 day', snapshot_time)` function.

### `?type=snapshot-history`

Count of snapshots per day (diagnostic endpoint).

**Returns:** `{ history: { day, snapshots }[] }`

---

## Sync API Endpoints

### `POST /api/sync` (Tier 3: On-Demand)

Triggers a full sync by default, or incremental with `?tier=incremental`.

**File:** `src/app/api/sync/route.ts`

**Returns:** `{ success, duration, tier, ...tier-specific-stats }`

### `GET /api/cron` (Internal, called by scheduler)

Called by the instrumentation hook scheduler. Defaults to incremental sync.

**File:** `src/app/api/cron/route.ts`

**Query params:**
- `tier` -- "incremental" (default) or "full"
- `secret` -- optional authentication (checked against `CRON_SECRET` env var)

---

## Intelligence Features

### Stage Regression Detection

**File:** `src/app/api/hubspot/route.ts` (`isStageRegression` function)

**How it works:** Compares numeric prefixes of stage labels. If the new stage number is lower than the old stage number, it is flagged as a regression. Stage 0 (Closed Lost) is excluded from regression detection -- losing a deal is not a "regression" in the pipeline sense.

**Example:** "05 - Negotiation" to "02 - Qualification" = regression (5 > 2). "05 - Negotiation" to "00 - Closed Lost" = not regression (stage 0 excluded).

**Important:** Stages without numeric prefixes (e.g., "BAU", "Renewed") default to -1, so they never trigger regression. This is intentional for the Renewal pipeline's alt stages.

**Display:** Red `REGR` badge + red left border on the changelog row.

### Close Date Slip Detection

**File:** `src/components/ChangelogFeed.tsx`

**How it works:** When `property === "closedate"`, compares `new Date(newValue).getTime() > new Date(oldValue).getTime()`. If true, the close date slipped (pushed out).

**Display:** Orange `SLIP` badge + orange left border.

### Stale Deal Detection

**File:** `src/app/api/hubspot/route.ts` (`stale-deals` case)

**Criteria:**
- Deal is in a mid-funnel stage (Proposal, Negotiation, Solutioning, Qualification, or their variants)
- Last changelog activity (stage or amount change) was 30+ days ago, or no activity exists at all
- Stage name does not contain "closed"

**Display:** Dedicated card in sidebar showing deal name, amount, stage, owner, and days stale. Sorted by dollar value descending.

### Time-in-Stage Badges

**File:** `src/components/RecentDeals.tsx`

Calculated from `deal.stageEnteredAt` (the HubSpot `hs_v2_date_entered_current_stage` property).

| Days in Stage | Color |
|--------------|-------|
| < 14 days | Green (`var(--accent-green)`) |
| 14-29 days | Amber/orange (`var(--accent-orange)`) |
| 30+ days | Red (`var(--accent-red)`) |

### Weighted Pipeline

Stage probability weights (defined in `STAGE_WEIGHTS` in `src/lib/hubspot.ts` and mirrored in `STAGE_WEIGHT_MAP` in the API route) are multiplied by deal amounts:

```
weighted_value = SUM(amount * stage_weight)
```

Only applied to Growth, VS-Sales, and Partner Leads pipelines (Renewal pipelines do not have weights assigned).

### Win Rate Calculation

**File:** `src/components/StatsCards.tsx`

```
winRate = closedWonCount / (closedWonCount + closedLostCount) * 100
```

Displayed as a percentage on the Closed Won stat card. Only shows if denominator > 0.

---

## Themes

Three visual themes, controlled by `data-theme` attribute on the root element. Persisted via `localStorage`.

### Terminal (default)

- Background: `#0a0e17` (deep navy)
- Card background: `#151d2e`
- Accent colors: cyan, green, blue, orange, red, purple
- Font: Geist Sans (body), Geist Mono (data)
- Card borders: solid with subtle gradient glow (`card-glow::before`)

### Console (`data-theme="chromatic"`)

- Background: `#000000` (pure black)
- All colors mapped to green monochrome (`#33ff33`)
- Text brightened: primary `#e0e0e0`, secondary `#a0a0a0`
- Font: forced monospace everywhere via `font-family: inherit !important`
- Border radius: 0 on everything (`border-radius: 0 !important`)
- Card borders: dashed style
- Card glow: disabled (`display: none`)

### Light (`data-theme="light"`)

- Background: `#f8fafc` (near-white)
- Card background: `#ffffff`
- Accents: darker variants for readability (e.g., green becomes `#059669`)
- Card shadow instead of glow: `box-shadow: 0 1px 3px rgba(0,0,0,0.06)`

Theme CSS variables are defined in `src/app/globals.css`. The `ThemeToggle` component is in `src/components/ThemeToggle.tsx`.

---

## File Structure

```
ceo-dashboard/
  db/
    init.sql                  # Database schema (tables, hypertables, views, indexes)
  nginx/
    ceo-dashboard.conf        # Nginx reverse proxy config
  scripts/
    setup.sh                  # First-time server setup (run as root)
    deploy.sh                 # Deploy updates (pull, build, restart)
  src/
    app/
      api/
        cron/route.ts         # GET endpoint for scheduled sync
        hubspot/route.ts      # Main API: 16 endpoint types via ?type= parameter
        sync/route.ts         # POST endpoint for manual sync trigger
      globals.css             # Theme definitions, animations, stage colors
      layout.tsx              # Root layout with font loading
      page.tsx                # Main dashboard (client-side, all state management)
      updates/page.tsx        # Version history and dev notes page
    components/
      ChangelogFeed.tsx       # Changelog timeline with date grouping and badges
      NetMovementBar.tsx      # Pipeline in/out flow visualization
      PipelineFunnel.tsx      # Stage breakdown card (used for Growth, Renewal, Upsell)
      RecentDeals.tsx         # Recently changed deals with time-in-stage badges
      StaleDealsList.tsx      # Stale deals warning card
      StatsCards.tsx          # Top stat cards (Open Pipeline, Changes, Won, Lost)
      StatusBar.tsx           # Header with sync status, refresh button, theme toggle
      ThemeToggle.tsx         # Three-way theme switcher
    instrumentation.ts        # Self-scheduling sync timers (runs on server start)
    lib/
      db.ts                   # PostgreSQL connection pool (pg)
      hubspot.ts              # HubSpot API helpers, stage/pipeline mappings, types
      sync.ts                 # Three-tier sync engine
  docker-compose.yml          # Development Docker config
  docker-compose.prod.yml     # Production Docker config (restart: always, shm_size)
  ecosystem.config.js         # pm2 process config
  next.config.ts              # Next.js config (reactStrictMode: false)
  package.json                # Dependencies and scripts
```
