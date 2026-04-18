"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HealthBadge } from "@/components/HealthBadge";
import { TrendIcons } from "@/components/TrendIcons";
import type { HealthBucket, HealthPenalty } from "@/lib/health";

interface TimelineEntry {
  property: string;
  propertyLabel: string;
  oldValue: string | null;
  newValue: string | null;
  oldLabel: string | null;
  newLabel: string | null;
  timestamp: string;
  sourceType: string;
  isRegression: boolean;
}

interface DealDetail {
  deal: {
    id: string;
    dealName: string;
    pipeline: string;
    pipelineName: string;
    dealStage: string;
    stageName: string;
    amount: number;
    closeDate: string | null;
    createdAt: string;
    updatedAt: string;
    stageEnteredAt: string | null;
    dealType: string | null;
    nextStep: string | null;
    ownerName: string;
  };
  health: {
    score: number | null;
    bucket: HealthBucket;
    penalties: HealthPenalty[];
    signals?: {
      regression_count?: number | null;
      slip_count?: number | null;
      amount_net?: number | null;
    };
  };
  timeline: TimelineEntry[];
}

interface AiSummaryResponse {
  summary: string | null;
  parsed: { risk: string; why: string[]; next: string } | null;
  cached: boolean;
  error?: string;
  model?: string;
  generatedAt?: string;
}

const MIN_W = 320;
const MAX_W = 900;
const DEFAULT_W = 480;
const STORAGE_KEY = "revradar-drawer-width";
const HUBSPOT_BASE = "https://app.hubspot.com/contacts/3282655/record/0-3";

export function DealDrawer({
  dealId,
  onClose,
}: {
  dealId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(DEFAULT_W);
  const [summary, setSummary] = useState<AiSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const dragging = useRef(false);

  // Hydrate width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved);
      if (Number.isFinite(n) && n >= MIN_W && n <= MAX_W) setWidth(n);
    }
  }, []);

  // Escape closes the drawer
  useEffect(() => {
    if (!dealId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dealId, onClose]);

  // Fetch deal details when opened
  useEffect(() => {
    if (!dealId) {
      setDetail(null);
      setSummary(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setSummary(null);
    fetch(`/api/deal/${dealId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load deal");
        return r.json();
      })
      .then((d: DealDetail) => {
        if (!cancelled) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e.message || e));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [dealId]);

  // Fetch AI summary once deal is loaded (cached server-side)
  const fetchSummary = useCallback(async (force = false) => {
    if (!dealId) return;
    setSummaryLoading(true);
    try {
      const url = `/api/deal/${dealId}/summary${force ? "?refresh=1" : ""}`;
      const res = await fetch(url, { method: force ? "POST" : "GET" });
      const data: AiSummaryResponse = await res.json();
      setSummary(data);
    } catch {
      setSummary({ summary: null, parsed: null, cached: false, error: "Network error" });
    } finally {
      setSummaryLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (detail) fetchSummary(false);
  }, [detail, fetchSummary]);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;
    const move = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.max(MIN_W, Math.min(MAX_W, startW + (startX - ev.clientX)));
      setWidth(next);
    };
    const up = () => {
      dragging.current = false;
      localStorage.setItem(STORAGE_KEY, String(width));
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (!dealId) return null;

  const riskBadge = summary?.parsed?.risk || (detail?.health.bucket === "red" ? "AT RISK" : detail?.health.bucket === "amber" ? "WATCH" : detail?.health.bucket === "green" ? "HEALTHY" : "");
  const riskColor = detail?.health.bucket === "red" ? "var(--accent-red)" : detail?.health.bucket === "amber" ? "var(--accent-orange)" : "var(--accent-green)";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-[60] sm:bg-black/20"
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Deal details"
        className="fixed top-0 right-0 bottom-0 z-[61] flex bg-[var(--bg-card)] border-l border-[var(--border-color)] shadow-2xl animate-slide-in"
        style={{ width: typeof window !== "undefined" && window.innerWidth < 640 ? "100vw" : `${width}px` }}
      >
        {/* Resize handle — desktop only */}
        <div
          onMouseDown={onDragStart}
          className="hidden sm:block absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:bg-[var(--accent-blue)] transition-colors"
          title="Drag to resize"
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[var(--border-color)] shrink-0">
            <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
              Deal detail
            </span>
            <button
              onClick={onClose}
              className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer px-2 py-1"
              title="Close (Esc)"
            >
              ✕
            </button>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
            {loading && (
              <p className="font-mono text-sm text-[var(--text-muted)]">loading…</p>
            )}
            {error && (
              <p className="font-mono text-xs text-[var(--accent-red)] border border-[var(--accent-red)] bg-[var(--accent-red-dim)] px-3 py-2 rounded">
                {error}
              </p>
            )}
            {detail && (
              <>
                {/* Deal header */}
                <div>
                  <div className="flex items-start gap-2">
                    <h2 className="font-mono text-base font-semibold text-[var(--text-primary)] flex-1 leading-tight">
                      {detail.deal.dealName}
                    </h2>
                    <a
                      href={`${HUBSPOT_BASE}/${detail.deal.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-blue)] transition-colors shrink-0 mt-1"
                      title="Open in HubSpot"
                    >
                      ↗ HubSpot
                    </a>
                  </div>
                  <div className="mt-1.5">
                    <TrendIcons
                      bucket={detail.health.bucket}
                      amount={detail.deal.amount}
                      momentumSignals={detail.health.signals}
                      compact={false}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
                    <div>
                      <span className="text-[var(--text-muted)]">Amount </span>
                      <span className="text-[var(--accent-green)]">{fmtMoney(detail.deal.amount)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Stage </span>
                      <span className="text-[var(--text-secondary)]">{detail.deal.stageName}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Pipeline </span>
                      <span className="text-[var(--text-secondary)]">{detail.deal.pipelineName}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Owner </span>
                      <span className="text-[var(--text-secondary)]">{detail.deal.ownerName}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Close </span>
                      <span className="text-[var(--text-secondary)]">{detail.deal.closeDate ? fmtDate(detail.deal.closeDate) : "—"}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Created </span>
                      <span className="text-[var(--text-secondary)]">{fmtDate(detail.deal.createdAt)}</span>
                    </div>
                  </div>
                  {detail.deal.nextStep && (
                    <div className="mt-2 font-mono text-[11px] text-[var(--text-secondary)] border-l-2 border-[var(--border-color)] pl-2">
                      <span className="text-[var(--text-muted)]">Next step: </span>
                      {detail.deal.nextStep}
                    </div>
                  )}
                </div>

                {/* Health card */}
                {detail.health.score !== null && (
                  <div className="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <HealthBadge score={detail.health.score} bucket={detail.health.bucket} size="md" />
                      <span className="font-mono text-xs text-[var(--text-secondary)]">
                        Deal health
                      </span>
                    </div>
                    {detail.health.penalties.length === 0 ? (
                      <p className="font-mono text-[11px] text-[var(--text-muted)]">No penalties — this deal is clean.</p>
                    ) : (
                      <ul className="font-mono text-[11px] space-y-1">
                        {detail.health.penalties.map((p) => (
                          <li key={p.code} className="flex items-start gap-2">
                            <span className="shrink-0 text-[var(--accent-red)]">−{p.amount}</span>
                            <span className="text-[var(--text-secondary)]">{p.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* AI Summary */}
                <div className="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                      AI summary
                    </span>
                    <button
                      onClick={() => fetchSummary(true)}
                      disabled={summaryLoading}
                      className="font-mono text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-blue)] transition-colors cursor-pointer disabled:opacity-50"
                      title="Regenerate (bypass cache)"
                    >
                      {summaryLoading ? "generating…" : "↻ regenerate"}
                    </button>
                  </div>
                  {summaryLoading && !summary && (
                    <p className="font-mono text-[11px] text-[var(--text-muted)]">generating…</p>
                  )}
                  {summary?.error && (
                    <p className="font-mono text-[11px] text-[var(--accent-red)]">
                      {summary.error}
                    </p>
                  )}
                  {summary?.parsed && (
                    <div className="space-y-2">
                      <div
                        className="font-mono text-[11px] font-semibold px-2 py-1 rounded inline-block"
                        style={{ color: riskColor, borderColor: riskColor, borderWidth: 1, backgroundColor: "transparent" }}
                      >
                        RISK: {summary.parsed.risk || riskBadge}
                      </div>
                      {summary.parsed.why.length > 0 && (
                        <div>
                          <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Why</div>
                          <ul className="font-mono text-[11px] space-y-1 list-disc list-inside text-[var(--text-secondary)]">
                            {summary.parsed.why.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {summary.parsed.next && (
                        <div>
                          <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Next</div>
                          <p className="font-mono text-[11px] text-[var(--text-secondary)]">{summary.parsed.next}</p>
                        </div>
                      )}
                      {summary.generatedAt && (
                        <p className="font-mono text-[9px] text-[var(--text-muted)] mt-2">
                          {summary.cached ? "cached" : "fresh"} · {summary.model || "?"} · {new Date(summary.generatedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                  {summary && !summary.parsed && summary.summary && !summary.error && (
                    <p className="font-mono text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap">
                      {summary.summary}
                    </p>
                  )}
                </div>

                {/* Timeline */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                      Activity
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-color)]">
                      {detail.timeline.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {detail.timeline.map((ev, i) => (
                      <TimelineRow key={i} ev={ev} />
                    ))}
                    {detail.timeline.length === 0 && (
                      <p className="font-mono text-[11px] text-[var(--text-muted)]">No activity recorded.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function TimelineRow({ ev }: { ev: TimelineEntry }) {
  const color = ev.isRegression
    ? "var(--accent-red)"
    : ev.property === "dealstage"
    ? "var(--accent-purple)"
    : ev.property === "amount"
    ? "var(--accent-cyan)"
    : ev.property === "closedate"
    ? "var(--accent-orange)"
    : "var(--text-muted)";
  const tag = ev.property === "dealstage"
    ? (ev.isRegression ? "REGR" : "STAGE")
    : ev.property === "amount"
    ? "AMT"
    : ev.property === "closedate"
    ? "DATE"
    : ev.property === "created"
    ? "NEW"
    : ev.property === "hs_next_step"
    ? "NEXT"
    : ev.property.toUpperCase();

  return (
    <div
      className="flex items-start gap-2 py-1.5 pl-2 border-l-2"
      style={{ borderColor: color }}
    >
      <span className="font-mono text-[9px] text-[var(--text-muted)] shrink-0 w-14">
        {fmtShort(ev.timestamp)}
      </span>
      <span
        className="font-mono text-[9px] px-1 py-0.5 rounded border shrink-0"
        style={{ color, borderColor: color, backgroundColor: "transparent" }}
      >
        {tag}
      </span>
      <span className="font-mono text-[10px] text-[var(--text-secondary)] flex-1 break-words">
        {ev.oldLabel || ev.oldValue
          ? `${ev.oldLabel || ev.oldValue} → ${ev.newLabel || ev.newValue || ""}`
          : ev.newLabel || ev.newValue || ev.propertyLabel}
      </span>
    </div>
  );
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
