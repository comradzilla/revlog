"use client";

import Link from "next/link";

interface Update {
  version: string;
  date: string;
  title: string;
  description: string;
  changes: { tag: string; tagColor: string; text: string }[];
}

const UPDATES: Update[] = [
  {
    version: "2.3",
    date: "2026-03-23",
    title: "Pipeline Ledger + Smart Filters",
    description:
      "Bank-statement view of pipeline value over time, multi-select pipeline filters, and filter-responsive stats cards.",
    changes: [
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Pipeline Ledger — flat bank-statement view showing every value-affecting transaction with running balance" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "View toggle dropdown on Changelog header — switch between Changelog and Pipeline Ledger" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Quarter-scoped balance — ledger tracks Q1 pipeline ($989K) separately from all-time ($16.3M)" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Multi-select pipeline filter — toggle Growth + Renewal together, like quarter multi-select" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Open Pipeline card shows filtered value + global total as context" },
      { tag: "IMPROVED", tagColor: "var(--accent-cyan)", text: "Pipeline-value API now accepts quarter, pipeline, and dealType filters" },
      { tag: "FIX", tagColor: "var(--accent-orange)", text: "Mobile changelog overflow — rows no longer spill past screen edge" },
      { tag: "FIX", tagColor: "var(--accent-orange)", text: "Mobile header overflow — tightened padding, hidden dividers on small screens" },
    ],
  },
  {
    version: "2.2",
    date: "2026-03-23",
    title: "Authentication + Mobile Log Mode",
    description:
      "Secures the dashboard with password auth and makes it fully usable on mobile with a changelog-first layout.",
    changes: [
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Password login page with terminal aesthetic — supports all 3 themes" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "httpOnly session cookie with HMAC-SHA256 signing (7-day expiry, constant-time comparison)" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Middleware route protection — redirects to /login, 401 for API routes" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Logout button in header bar" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Mobile: compact stats bar — pipeline value, changes today, won, lost in one line" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Mobile: slide-up filter drawer with all filters (quarter, deal type, pipeline, change type)" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Mobile: tabbed sidebar — Funnels / Stale / Recent tabs below changelog" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Mobile: two-line changelog rows (time + deal on line 1, tags + change on line 2)" },
      { tag: "FIX", tagColor: "var(--accent-orange)", text: "Fixed CRON_SECRET bypass bug — undefined secret no longer skips auth in production" },
      { tag: "INFRA", tagColor: "var(--accent-blue)", text: "Web Crypto API for auth (Edge runtime compatible) — no Node.js crypto dependency" },
    ],
  },
  {
    version: "2.1",
    date: "2026-03-23",
    title: "Smart Sync Architecture",
    description:
      "Three-tier sync replaces monolithic full-sync-every-time with incremental updates. Data freshness drops from 90s+ to 2-3s without external cron dependencies.",
    changes: [
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Tier 1: Incremental sync every 5 min — only fetches deals changed since last sync (typically 0-5 deals, ~2-3s)" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Tier 2: Full sync daily at 2 AM — complete deal scan, owner refresh, 7-day changelog window (no 50-deal limit)" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Tier 3: On-demand sync via POST /api/sync — manual trigger from dashboard or curl" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Self-contained scheduler via Next.js instrumentation hook — no external cron needed" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "StatusBar shows sync tier timestamps: 'incr: 3m ago · full: 14h ago'" },
      { tag: "INFRA", tagColor: "var(--accent-blue)", text: "HubSpot hs_lastmodifieddate GTE filter for incremental — returns only changed deals instead of all 3,022" },
      { tag: "INFRA", tagColor: "var(--accent-blue)", text: "Cron route accepts ?tier=incremental|full parameter (defaults to incremental)" },
      { tag: "IMPROVED", tagColor: "var(--accent-cyan)", text: "Full sync changelog window expanded from 50 most recent deals to all deals modified in last 7 days" },
    ],
  },
  {
    version: "2.0",
    date: "2026-03-23",
    title: "Pipeline Intelligence",
    description:
      "Transforms the changelog from an activity log into a decision-making tool. Answers not just 'what happened' but 'who, why, and should I be worried?'",
    changes: [
      // Changelog Enrichment
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Owner name displayed on every changelog entry" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Deal creation events — 3,022 historical deals backfilled, ongoing sync for new deals entering pipeline" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Stage regression detection — ⚠ REGR badge with red border when deals move backward (e.g., Negotiation → Qualification)" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Close date change tracking — blue CLOSE DATE tag, orange SLIP badge when dates push out" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Owner reassignment tracking — purple OWNER tag showing old → new owner" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "6 changelog filter tabs: all, stages, amounts, created, close date, owner" },
      // Pipeline Health
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Closed Lost stat card (red) alongside Closed Won — see what's walking away" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Win rate and average deal size computed on Closed Won card" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Weighted pipeline value on Open Pipeline card (stage-based probability: Prospecting 10%, Qual 25%, Solutioning 50%, Proposal 70%, Negotiation 90%)" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Net Movement bar — pipeline created vs won vs lost + deal values grew vs shrank for the period" },
      // Pipeline Intelligence
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Stale Deals warning card — deals in Proposal/Negotiation/Solutioning with no activity in 30+ days, sorted by dollar value" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Time-in-stage badges on recent deals: green (<14d), amber (14-30d), red (30d+)" },
      // Infrastructure
      { tag: "INFRA", tagColor: "var(--accent-blue)", text: "Sync now tracks 4 HubSpot properties: dealstage, amount, closedate, hubspot_owner_id" },
      { tag: "INFRA", tagColor: "var(--accent-blue)", text: "Pipeline snapshots include weighted_value column for trend reporting" },
      { tag: "INFRA", tagColor: "var(--accent-blue)", text: "6 new API endpoints: closed-lost, weighted-pipeline, net-movement, amount-movement, stale-deals, enhanced changelog" },
    ],
  },
  {
    version: "1.4",
    date: "2026-03-22",
    title: "Deal Type Filtering & Upsell Pipeline",
    description: "Added deal type awareness and upsell/expansion pipeline visibility.",
    changes: [
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Deal type filter — ALL / UPSELL / NEW BIZ toggle filters changelog and recent deals" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Upsell pipeline card in sidebar with inline pipeline toggle (Growth, VS-Sales, VS-Renewal, ALL)" },
      { tag: "FIX", tagColor: "var(--accent-orange)", text: "Fixed duplicate stages in Upsell card caused by deals spanning multiple pipelines" },
    ],
  },
  {
    version: "1.3",
    date: "2026-03-22",
    title: "Appearance Themes",
    description: "Three color profiles for different viewing preferences.",
    changes: [
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Terminal theme (default) — deep navy dark mode" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Console theme — pure black, green-on-black monochrome, dashed borders, zero border-radius, ASCII aesthetic" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Light theme — clean professional white mode" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Theme toggle in header with persistence via localStorage" },
    ],
  },
  {
    version: "1.2",
    date: "2026-03-22",
    title: "Quarter Filtering & Pipeline Value Formatting",
    description: "Multi-select quarter filtering and better large number display.",
    changes: [
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Multi-select quarter filter — select multiple quarters simultaneously" },
      { tag: "IMPROVED", tagColor: "var(--accent-cyan)", text: "Pipeline values display as $16.3M instead of $16283K" },
    ],
  },
  {
    version: "1.1",
    date: "2026-03-21",
    title: "TimescaleDB & Persistent Storage",
    description: "Moved from live HubSpot API calls to Postgres-backed reads with periodic sync.",
    changes: [
      { tag: "NEW", tagColor: "var(--accent-green)", text: "TimescaleDB (Docker) for persistent storage — hypertables for changelog and pipeline snapshots" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Full sync system: owners, deals (3,022), changelog, pipeline snapshots" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Recently Modified sidebar only shows deals with actual stage/amount changes" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Renewal Pipeline card in sidebar" },
      { tag: "FIX", tagColor: "var(--accent-orange)", text: "Eliminated HubSpot 429 rate limit errors by moving to database-backed reads" },
      { tag: "FIX", tagColor: "var(--accent-orange)", text: "Fixed owner names showing 'Unassigned' by fetching archived owners" },
      { tag: "FIX", tagColor: "var(--accent-orange)", text: "Fixed missing VS-Sales and legacy stage label mappings" },
    ],
  },
  {
    version: "1.0",
    date: "2026-03-21",
    title: "Initial Release",
    description: "CEO dashboard with HubSpot deal pipeline changelog in DevOps style.",
    changes: [
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Real-time changelog feed — stage and amount changes grouped by date" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Growth Pipeline funnel with stage counts and dollar values" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "4 stat cards: Open Pipeline, Changes Today, Changes (7d), Closed Won" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Every deal linked to HubSpot (hub 3282655)" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Auto-refresh every 2 minutes" },
      { tag: "NEW", tagColor: "var(--accent-green)", text: "Dark DevOps terminal aesthetic with monospace fonts" },
    ],
  },
];

// Dev notes / architecture decisions
const DEV_NOTES = [
  {
    title: "Architecture",
    notes: [
      "Next.js 16 App Router with TypeScript and Tailwind v4",
      "TimescaleDB (PostgreSQL + time-series hypertables) via Docker on port 5433",
      "Three-layer data flow: HubSpot API → sync.ts → Postgres → API routes → React client",
      "All dashboard reads come from Postgres — never hits HubSpot API directly",
      "Sync batches property history calls in groups of 5 to respect HubSpot rate limits (100/10s)",
    ],
  },
  {
    title: "Sync Strategy",
    notes: [
      "Three-tier: incremental (5 min, ~2-3s) → full daily (2 AM, ~60-90s) → on-demand (manual)",
      "Incremental uses HubSpot hs_lastmodifieddate GTE filter — only changed deals",
      "Full sync: owners → all deals (paginated) → 7-day changelog window → pipeline snapshot",
      "Self-scheduling via Next.js instrumentation hook — no external cron",
      "Changelog deduplication: checks deal_id + property + changed_at before insert",
      "Properties tracked: dealstage, amount, closedate, hubspot_owner_id",
      "Deal creation events generated from deals.created_at during sync",
      "Pipeline snapshots captured with weighted values using stage probability weights",
    ],
  },
  {
    title: "Stage Probability Weights",
    notes: [
      "Prospecting: 10%",
      "Qualification: 25%",
      "Solutioning: 50%",
      "Proposal: 70%",
      "Negotiation: 90%",
      "Applied to Growth, VS-Sales, and Partner Leads pipelines",
    ],
  },
  {
    title: "Database Tables",
    notes: [
      "owners — HubSpot owners (active + archived)",
      "deals — current state of all 3,022 deals",
      "deal_changelog — TimescaleDB hypertable, all property changes + creation events",
      "pipeline_snapshots — TimescaleDB hypertable, daily stage-level snapshots",
      "sync_meta — sync timestamps for incremental updates",
    ],
  },
  {
    title: "Known Considerations",
    notes: [
      "HubSpot deal_type field has inconsistent values: 'existingbusiness' and 'existing_business' both mean upsell",
      "Owner ID on deals has no foreign key constraint — some deals reference owners not in the owners table",
      "Changelog sync limited to 50 most recently modified deals per run to stay within rate limits",
      "reactStrictMode disabled in next.config.ts to prevent double-mount API hammering",
    ],
  },
];

export default function UpdatesPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1000px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-xs text-[var(--accent-blue)] hover:underline"
            >
              &larr; dashboard
            </Link>
            <div className="h-4 w-px bg-[var(--border-color)]" />
            <h1 className="font-mono text-sm font-semibold text-[var(--text-primary)]">
              <span className="text-[var(--accent-green)]">$</span> updates
              <span className="text-[var(--text-muted)]">/</span>devnotes
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1000px] mx-auto w-full px-6 py-8 space-y-12">
        {/* Product Updates */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <span className="font-mono text-xs text-[var(--accent-orange)]">&gt;</span>
            <h2 className="font-mono text-lg font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Product Updates
            </h2>
          </div>

          <div className="space-y-8">
            {UPDATES.map((update) => (
              <div
                key={update.version}
                className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-6"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm font-bold text-[var(--accent-blue)]">
                    v{update.version}
                  </span>
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    {update.date}
                  </span>
                  <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                    {update.title}
                  </span>
                </div>
                <p className="font-mono text-xs text-[var(--text-secondary)] mb-4">
                  {update.description}
                </p>
                <div className="space-y-1.5">
                  {update.changes.map((change, i) => (
                    <div key={i} className="flex items-start gap-2 font-mono text-xs">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded border font-bold shrink-0 mt-px"
                        style={{
                          borderColor: `${change.tagColor}44`,
                          backgroundColor: `${change.tagColor}15`,
                          color: change.tagColor,
                        }}
                      >
                        {change.tag}
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        {change.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Developer Notes */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <span className="font-mono text-xs text-[var(--accent-cyan)]">#</span>
            <h2 className="font-mono text-lg font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Developer Notes
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEV_NOTES.map((section) => (
              <div
                key={section.title}
                className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
              >
                <h3 className="font-mono text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
                  {section.title}
                </h3>
                <ul className="space-y-1.5">
                  {section.notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2 font-mono text-xs">
                      <span className="text-[var(--accent-blue)] shrink-0 mt-px">·</span>
                      <span className="text-[var(--text-secondary)]">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[var(--border-color)] pt-4 pb-8">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              CEO Dashboard &middot; Logicbroker
            </span>
            <Link
              href="/"
              className="font-mono text-[10px] text-[var(--accent-blue)] hover:underline"
            >
              back to dashboard
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
