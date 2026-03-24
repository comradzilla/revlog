# Changelog

Detailed version history for RevLog. Each entry documents what changed, why, and what files were touched.

---

## v2.3.2 (2026-03-24) -- CEO Bug Fixes

**Theme:** Fix 4 user-reported bugs from first CEO testing session.

### What Changed

- Changes (7D) card now uses server-side `changes-count` endpoint (was client-side capped at 200 records)
- Pipeline funnel sidebar (Growth/Renewal/Upsell) now filters by selected quarter on `close_date`
- Stale deals calculation uses `GREATEST(created_at, MAX(changelog))` to avoid 999-day fallback
- Added Playwright test suite: 11 suites, 67 tests covering API validation, calculations, responsiveness, formatting, interactions, themes

### Files Modified

| File | Change |
|------|--------|
| `src/app/api/hubspot/route.ts` | Added `changes-count` endpoint; added quarter filter to `pipeline-stats` + `dealtype-stats`; fixed stale deals `days_stale` to use `created_at` fallback |
| `src/app/page.tsx` | Fetch `changes-count` from API; pass `qParam` to funnel fetch URLs; replaced client-side week/today calculations |

---

## v2.3.1 (2026-03-24) -- Quarter-Scoped Ledger

**Theme:** Ledger now only shows transactions that impact the selected quarter's balance.

### What Changed

- Rewrote ledger SQL from single `changed_at` filter to UNION of 3 branches (close_date scoped)
- Added close date move tracking: DATE IN / DATE OUT badges when deals enter/leave a quarter
- Added "X out-of-quarter changes hidden" dismissable banner
- NULLIF safety for empty closedate strings in `::timestamptz` casts
- Every ledger row now moves the running balance (no more phantom deltas)

### Files Modified
- `src/app/api/hubspot/route.ts` — UNION query + closedate delta logic + hidden count
- `src/components/PipelineLedger.tsx` — `hiddenCount` prop, banner, DATE_IN/DATE_OUT badges
- `src/app/page.tsx` — Pass `hiddenCount` + update state type

---

## v2.3 (2026-03-23) -- Pipeline Ledger + Filter-Aware Stats

**Theme:** Bank-statement view of pipeline value over time, multi-select pipeline filters, and filter-responsive stats cards.

### What Changed

**Pipeline Ledger:**
- New "Pipeline Ledger" view alongside Changelog — switchable via dropdown on the CHANGELOG header
- Flat bank-statement layout: each transaction shows date, type badge, deal name, delta (+/-), running balance
- Running balance anchored to quarter-scoped pipeline when quarter filter is active
- Tracks amount changes, deal creation, closed won/lost exits (not stage moves — no dollar impact)
- Dual balance header: "Q1 2026: $989K / All: $16.3M"
- Mobile: compact date format (3-23-26), single-line rows at 375px

**Multi-Select Pipeline Filter:**
- Pipeline filter converted from single-select to multi-select (toggle like quarters)
- "ALL" button clears selection, individual pipelines toggle on/off
- API supports comma-separated pipeline IDs with `= ANY()` SQL matching

**Filter-Aware Stats:**
- Open Pipeline card shows filtered value when filters active: "$989K" + "6 deals · all: $16.3M"
- Pipeline-value API endpoint now accepts quarter, pipeline, dealType filters
- Returns both global and filtered totals

**Mobile Fixes:**
- Changelog rows: overflow-hidden + min-w-0 on Line 2, card padding reduced to p-3
- StatusBar header: padding/gaps tightened, dividers hidden on mobile

### Files Created

- `src/components/PipelineLedger.tsx` -- Flat ledger component with running balance

### Files Modified

- `src/app/api/hubspot/route.ts` -- pipeline-ledger endpoint, pipelineCondition() helper, filter-aware pipeline-value
- `src/app/page.tsx` -- View toggle state/dropdown, ledger fetch, multi-select pipeline state, filtered stats
- `src/components/StatsCards.tsx` -- Filtered/all split on Open Pipeline card
- `src/components/ChangelogFeed.tsx` -- Mobile overflow fixes
- `src/components/StatusBar.tsx` -- Mobile responsive header
- `src/components/MobileFilterDrawer.tsx` -- Multi-select pipeline buttons, hide change type in ledger view

---

## v2.2 (2026-03-23) -- Authentication + Mobile Log Mode

**Theme:** Secure the dashboard with password auth and make it usable on mobile with a changelog-first "log mode" layout.

### What Changed

**Authentication:**
- Password login page with terminal aesthetic (supports all 3 themes)
- httpOnly session cookie with HMAC-SHA256 signing via Web Crypto API (Edge runtime compatible)
- Next.js middleware protects all routes — redirects pages to /login, returns 401 JSON for API routes
- 7-day session expiry, constant-time password comparison to prevent timing attacks
- Logout button added to StatusBar (door-exit icon, red hover)
- CRON_SECRET bypass bug fixed: undefined secret no longer skips auth check in production
- Graceful dev mode: if SESSION_SECRET not set, middleware allows access (no auth in local dev)

**Mobile Responsive:**
- MobileStatsSummary: single-line compact stats bar ($16.3M pipeline | 2 today | $42K won | $125K lost)
- MobileFilterDrawer: slide-up bottom drawer with all filters (quarter, deal type, pipeline, change type)
- MobileSidebarTabs: tabbed Funnels/Stale/Recent view replaces stacked sidebar on mobile
- ChangelogFeed: two-line mobile rows (line 1: time + deal name, line 2: tags + change values)
- Desktop layout completely unchanged — all mobile components use sm:hidden / hidden sm:flex breakpoints
- Drawer slide-up animation with backdrop overlay

### Why

The dashboard had sensitive deal data (customer names, pipeline values) publicly accessible. Password auth was the minimum viable security. Mobile responsiveness was needed because the CEO checks the dashboard on his phone — the previous layout broke on small screens (filter bar overflow, sidebar stacking, changelog rows wrapping).

### Files Created

- `src/lib/auth.ts` -- HMAC token creation/verification (Web Crypto API)
- `src/middleware.ts` -- Route protection middleware
- `src/app/login/page.tsx` -- Terminal-styled login page
- `src/app/api/auth/login/route.ts` -- Login endpoint (validates password, sets cookie)
- `src/app/api/auth/logout/route.ts` -- Logout endpoint (clears cookie)
- `src/components/MobileFilterDrawer.tsx` -- Slide-up filter drawer
- `src/components/MobileStatsSummary.tsx` -- Compact stats bar
- `src/components/MobileSidebarTabs.tsx` -- Tabbed sidebar view

### Files Modified

- `src/components/StatusBar.tsx` -- Added logout button
- `src/app/api/cron/route.ts` -- Fixed CRON_SECRET bypass bug
- `src/components/ChangelogFeed.tsx` -- Two-line mobile rows (flex-col sm:flex-row)
- `src/app/page.tsx` -- Responsive breakpoints, mobile components, MobileFilterDrawer render
- `src/app/globals.css` -- Drawer slide-up animation, mobile changelog spacing

### Design Decisions

- **Web Crypto API over Node.js crypto:** Middleware runs in Edge runtime, which doesn't support Node.js `crypto` module. Web Crypto API (`crypto.subtle`) works in both Edge and Node.js runtimes.
- **No database sessions:** Stateless HMAC token in cookie, verified on each request. No session table needed.
- **Progressive mobile enhancement:** Same page, responsive CSS. No separate mobile route. Changelog is the hero on mobile because that's the primary thing the CEO checks.
- **MobileFilterDrawer at component tree root:** Rendered outside `<main>` for fixed positioning to work correctly with the backdrop overlay.

---

## v2.1 (2026-03-23) -- Smart Sync Architecture

**Theme:** Replace the monolithic full-sync-every-time approach with a three-tier sync that keeps data fresh in 2-3 seconds instead of 90+ seconds.

### What Changed

- **Tier 1 Incremental Sync:** New `runIncrementalSync()` function queries HubSpot with `hs_lastmodifieddate GTE <last_sync_timestamp>` filter. Only fetches deals that actually changed. In a typical 5-minute window, 0-5 deals out of 3,022 have changed, making this complete in ~2-3 seconds with 1-10 API calls.

- **Tier 2 Full Sync:** Refactored `runFullSync()` now serves as a daily safety net (2 AM) rather than the primary sync method. Expanded changelog window from "50 most recently modified deals" to "all deals modified in last 7 days" since it only runs once daily.

- **Tier 3 On-Demand:** `POST /api/sync` endpoint for manual triggers. Defaults to full sync.

- **Self-Scheduling:** `src/instrumentation.ts` uses Next.js instrumentation hook to register `setInterval` timers on server start. No external cron needed.

- **Cron Route:** New `GET /api/cron` endpoint accepts `?tier=incremental|full` parameter. Defaults to incremental. Optional `?secret=` authentication via `CRON_SECRET` env var.

- **StatusBar Enhancement:** Shows sync tier timestamps: "incr: 3m ago . full: 14h ago"

- **sync_meta Table:** New keys: `last_incremental_sync`, `last_full_sync`, `last_changelog_sync`, `last_creation_sync`

### Why

The v2.0 full sync took 60-90 seconds and made ~150 API calls, but 99.8% of deals were unchanged. The incremental approach means the dashboard always shows changes within 5 minutes, and the daily full sync catches any edge cases.

Vercel was ruled out as a deployment target because serverless functions cannot maintain `setInterval` timers. The instrumentation hook approach requires a long-lived Node.js process (pm2 on a VPS).

### Files Modified

- `src/lib/sync.ts` -- Complete rewrite: split into `runIncrementalSync()` and `runFullSync()`, added shared helpers (syncOwners, syncChangelog, syncDealCreations, capturePipelineSnapshot, updateSyncMeta, getSyncMeta)
- `src/instrumentation.ts` -- New file: self-scheduling timers
- `src/app/api/cron/route.ts` -- New file: GET endpoint for scheduled sync
- `src/app/api/sync/route.ts` -- Simplified to call sync.ts functions
- `src/components/StatusBar.tsx` -- Added sync tier timestamp display
- `src/app/page.tsx` -- Fetch sync-status, pass SyncMeta to StatusBar
- `src/app/updates/page.tsx` -- Added v2.1 entry

### Gotchas

- The instrumentation hook runs `setTimeout(triggerSync("incremental"), 30_000)` on boot -- the 30-second delay lets the server stabilize before making API calls.
- The full sync at 2 AM uses `msUntilNextHour(2)` which calculates time from `new Date()` -- this uses the server's local timezone, not UTC.
- If the server restarts, all timers reset. The first incremental runs 30s after boot, so data freshness is restored quickly.

---

## v2.0 (2026-03-23) -- Pipeline Intelligence

**Theme:** Transform the changelog from a passive activity log into a decision-making tool. Answer "who, why, and should I be worried?" not just "what happened."

### What Changed (14 enhancements)

**Changelog Enrichment:**
1. Owner name displayed on every changelog entry (JOIN with owners table)
2. Deal creation events synced: 3,022 historical deals backfilled via SQL INSERT...SELECT from deals table
3. Stage regression detection: `isStageRegression()` compares numeric stage prefixes, shows red REGR badge
4. Close date change tracking: blue CLOSE DATE tag, property history for `closedate` now synced
5. Close date slip detection: orange SLIP badge when new date > old date
6. Owner reassignment tracking: purple OWNER tag, property history for `hubspot_owner_id` now synced
7. Six changelog filter tabs: all, stages, amounts, created, close date, owner

**Pipeline Health:**
8. Closed Lost stat card (red) alongside Closed Won
9. Win rate and average deal size on Closed Won card
10. Weighted pipeline value displayed on Open Pipeline card
11. Net Movement bar: created vs won vs lost (deal counts + values), amount grew vs shrank

**Pipeline Intelligence:**
12. Stale Deals warning card: deals in Proposal/Negotiation/Solutioning with 30+ days no activity
13. Time-in-stage badges on recent deals: green <14d, amber 14-30d, red 30d+

**Infrastructure:**
14. Sync tracks 4 properties (up from 2): dealstage, amount, closedate, hubspot_owner_id

### Why

The v1.x dashboard showed that something changed but not whether to be concerned. Stage regressions, close date slips, and stale deals are the signals a CEO needs to intervene. The weighted pipeline gives a more realistic forecast than raw pipeline value.

### Files Modified

- `src/lib/sync.ts` -- Added closedate and hubspot_owner_id to TRACKED_HISTORY_PROPS, syncDealCreations(), capturePipelineSnapshot() with weighted values
- `src/lib/hubspot.ts` -- Added STAGE_WEIGHTS export
- `src/app/api/hubspot/route.ts` -- Added 6 new endpoint types (closed-lost, weighted-pipeline, net-movement, amount-movement, stale-deals, enhanced changelog with isRegression), added isStageRegression() function, added dealTypeCondition() helper
- `src/app/page.tsx` -- Added state for closedLost, netMovement, amountMovement, staleDeals, changelog filter tabs
- `src/components/StatsCards.tsx` -- Added Closed Lost card, win rate, avg deal size, weighted pipeline on Open Pipeline card
- `src/components/ChangelogFeed.tsx` -- Added PROPERTY_CONFIG for color-coded change type tags, REGR badge, SLIP badge, owner change display, date change display
- `src/components/NetMovementBar.tsx` -- New component
- `src/components/StaleDealsList.tsx` -- New component
- `src/components/RecentDeals.tsx` -- Added time-in-stage badges (daysInStage, getDaysColor)
- `db/init.sql` -- Added weighted_value column to pipeline_snapshots
- `src/app/updates/page.tsx` -- Added v2.0 entry

### Design Decisions

- **Regression excludes Closed Lost (stage 0):** A deal moving to "00 - Closed Lost" is not a regression in the pipeline sense -- it is a loss. Only mid-funnel backward movement is flagged.
- **Stale deals only in mid-funnel stages:** Prospecting deals are expected to be slow. Only Proposal, Negotiation, Solutioning, and Qualification stages trigger stale warnings because deals at those stages represent committed pipeline at risk.
- **30-day stale threshold:** Chosen based on typical B2B SaaS sales cycle. Could be made configurable later.

---

## v1.4 (2026-03-22) -- Deal Type Filtering and Upsell Pipeline

**Theme:** Add deal type awareness so the CEO can view the pipeline through different lenses (all deals, upsell/expansion only, new business only).

### What Changed

- Deal type filter: ALL / UPSELL / NEW BIZ toggle in the filter bar
- `dealtype` property added to deal sync (DEAL_PROPERTIES array)
- `deal_type` column added to deals table
- Upsell pipeline card in sidebar with inline pipeline toggle (Growth, VS-Sales, VS-Renewal, ALL)
- New `?type=dealtype-stats` API endpoint with `dtPipeline` parameter
- Deal type normalization: `existingbusiness` and `existing_business` both map to "upsell", `newbusiness` and `new_business` both map to "new business"

### Why

Upsell/expansion deals span multiple pipelines (Growth, VS-Sales, VS-Renewal) so they were invisible when viewing a single pipeline. The dedicated Upsell card with pipeline toggle shows all upsell deals regardless of which pipeline they are in.

### Files Modified

- `src/lib/sync.ts` -- Added `dealtype` to DEAL_PROPERTIES, `deal_type` to upsertDeal
- `src/app/api/hubspot/route.ts` -- Added UPSELL_TYPES, NEW_BIZ_TYPES constants, dealTypeCondition() helper, dealtype-stats endpoint, deal type filtering on changelog and recently-changed
- `src/app/page.tsx` -- Added dealTypeFilter state, upsellPipelineFilter state, upsellPipelines state, Upsell PipelineFunnel card with filter props
- `src/components/PipelineFunnel.tsx` -- Added filterOptions, activeFilter, onFilterChange props
- `src/components/RecentDeals.tsx` -- Added deal type badge (getDealTypeLabel, getDealTypeColor)
- `db/init.sql` -- Added deal_type column to deals table

### Gotchas

- HubSpot's `dealtype` field is inconsistent: some deals have `existingbusiness`, others have `existing_business`. The API route uses `= ANY(ARRAY['existingbusiness', 'existing_business'])` to catch both.
- Upsell deals exist across multiple pipelines, so the Upsell card has its own pipeline filter independent of the global pipeline filter.

---

## v1.3 (2026-03-22) -- Appearance Themes

**Theme:** Add visual customization for different viewing contexts (dark room, presentations, etc.).

### What Changed

- Three themes: Terminal (default), Console, Light
- CSS custom properties for all colors, defined in `globals.css` `@layer base`
- Theme toggle component with persistence via `localStorage`
- Console theme forces monospace on all elements, strips border-radius, uses dashed borders

### Why

The original Terminal theme works great for the "DevOps dashboard" aesthetic, but is too bright for late-night viewing (Console) and too dark for presentations (Light).

### Files Modified

- `src/app/globals.css` -- Added `[data-theme="chromatic"]` and `[data-theme="light"]` variable sets, console-specific overrides (force monospace, zero border-radius, dashed borders, disable card glow)
- `src/components/ThemeToggle.tsx` -- New component: three-way toggle, reads/writes localStorage
- `src/components/StatusBar.tsx` -- Added ThemeToggle to header
- `src/app/layout.tsx` -- Added theme initialization script

### Design Decisions

- Console theme uses `data-theme="chromatic"` attribute name (not "console") because it was the initial working name and was kept to avoid breaking localStorage values.
- Console theme needed explicit text brightening (`--text-primary: #e0e0e0`, `--text-secondary: #a0a0a0`) because pure green monochrome was unreadable for long text passages.
- Light mode card shadow replaces card glow because glowing borders look wrong on white backgrounds.

---

## v1.2 (2026-03-22) -- Quarter Filtering and Value Formatting

**Theme:** Better time-based analysis and more readable large numbers.

### What Changed

- Multi-select quarter filter: click to toggle quarters on/off, minimum 1 quarter selected
- Quarter filter applied to changelog, closed-won, closed-lost, net-movement, amount-movement
- Pipeline values display as `$16.3M` instead of `$16,283K`
- `formatDollars()` utility function

### Why

Comparing Q1 vs Q4 or multi-quarter views is essential for trend analysis. The M/K formatting makes stat cards more scannable at a glance.

### Files Modified

- `src/app/api/hubspot/route.ts` -- Added parseQuarters() and quarterCondition() helpers, applied to 5 endpoint types
- `src/app/page.tsx` -- Added selectedQuarters state, toggleQuarter function, quarter filter UI
- `src/components/StatsCards.tsx` -- Added formatDollars() with M/K formatting, quarter label display

---

## v1.1 (2026-03-21) -- TimescaleDB and Persistent Storage

**Theme:** Move from direct HubSpot API calls on every page load to a database-backed architecture with periodic sync.

### What Changed

- TimescaleDB added via Docker Compose on port 5433
- Database schema: owners, deals, deal_changelog (hypertable), pipeline_snapshots (hypertable), sync_meta tables
- Full sync system: owners (active + archived), all deals (paginated), changelog (property history), pipeline snapshots
- All dashboard reads now come from Postgres instead of HubSpot API
- Renewal Pipeline card added to sidebar
- Recently Modified sidebar now only shows deals with actual stage/amount changes (via deal_changelog JOIN)
- VS-Sales and legacy stage label mappings added

### Why

Direct HubSpot API calls on every page load caused:
1. **Rate limiting (429 errors):** HubSpot allows 100 calls per 10 seconds. A single dashboard load made ~20 calls, and with auto-refresh every 2 minutes, rate limits were hit regularly.
2. **Slow page loads:** Each API call to HubSpot takes 200-500ms. Fetching from local Postgres takes 1-5ms.
3. **No history:** Without storing data, we could not show trends, compute net movement, or detect patterns.

TimescaleDB was chosen over plain Postgres because:
- Hypertables automatically partition time-series data (changelog, snapshots)
- `time_bucket()` function for easy daily/weekly/monthly aggregations
- Built-in compression for old data
- It is still just Postgres -- standard SQL, pg driver, no special client needed

### Files Modified

- `docker-compose.yml` -- New file: TimescaleDB container
- `db/init.sql` -- New file: complete schema
- `src/lib/db.ts` -- New file: pg connection pool
- `src/lib/sync.ts` -- New file: full sync engine
- `src/lib/hubspot.ts` -- Added VS-Sales stage mappings, legacy stage IDs, owner fetching for both active and archived
- `src/app/api/hubspot/route.ts` -- Rewrote all endpoints to read from Postgres instead of HubSpot API
- `src/app/api/sync/route.ts` -- New file: manual sync trigger
- `src/app/page.tsx` -- Updated to fetch from new Postgres-backed endpoints
- `src/components/PipelineFunnel.tsx` -- Added Renewal Pipeline support

### Gotchas

- Port 5433 (not 5432) is used to avoid conflict with any existing local Postgres installation.
- The deals table has no foreign key constraint from owner_id to owners.id because some deals reference owner IDs that do not exist even in the archived owners list.
- The `reactStrictMode: false` setting in `next.config.ts` was added here to prevent React's development double-mount from causing duplicate API calls during dashboard load.

---

## v1.0 (2026-03-21) -- Initial Release

**Theme:** CEO dashboard with HubSpot deal pipeline changelog in DevOps terminal aesthetic.

### What Changed

- Real-time changelog feed: stage and amount changes fetched from HubSpot property history, grouped by date
- Growth Pipeline funnel card with stage counts and dollar values
- Four stat cards: Open Pipeline, Changes Today, Changes (7d), Closed Won
- Every deal name links to its HubSpot record (hub 3282655)
- Auto-refresh every 2 minutes
- Dark terminal aesthetic with monospace fonts (Geist, Geist Mono)
- Stage-colored badges: Prospecting (blue), Qualification (purple), Solutioning (orange), Proposal (cyan), Negotiation (orange), Closed Won (green), Closed Lost (red)
- Pulsing green "Live" indicator in header

### Why

Ashkan wanted a single-screen view of pipeline activity without clicking through HubSpot's multi-page deal views. The DevOps terminal aesthetic was chosen because it feels like a live monitoring dashboard, reinforcing the "always-on" pipeline intelligence concept.

### Files Created

- `src/app/page.tsx` -- Main dashboard page
- `src/app/layout.tsx` -- Root layout
- `src/app/globals.css` -- Terminal theme CSS
- `src/lib/hubspot.ts` -- HubSpot API client with Growth pipeline stage mappings
- `src/components/StatsCards.tsx` -- Stat cards
- `src/components/ChangelogFeed.tsx` -- Changelog timeline
- `src/components/PipelineFunnel.tsx` -- Pipeline funnel card
- `src/components/RecentDeals.tsx` -- Recent deals sidebar
- `src/components/StatusBar.tsx` -- Header bar
- `package.json` -- Next.js 16.2.0, React 19.2.4, Tailwind v4, pg
