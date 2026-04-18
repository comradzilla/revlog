"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HealthWeights } from "@/lib/health";

const FIELDS: { key: keyof HealthWeights; label: string; hint: string }[] = [
  { key: "regression", label: "Regression", hint: "Per stage regression in last 90d" },
  { key: "regressionCap", label: "Regression cap", hint: "Max total penalty from regressions" },
  { key: "slip", label: "Close-date slip", hint: "Per slip in last 90d" },
  { key: "slipCap", label: "Slip cap", hint: "Max total penalty from slips" },
  { key: "amountShrunk", label: "Amount shrank", hint: "If net amount change <0 in last 90d" },
  { key: "timeInStage", label: "Time-in-stage > 30d", hint: "Mid-funnel only" },
  { key: "staleNextStep", label: "Stale next step", hint: "14+ days since update, mid-funnel" },
  { key: "noNextStep", label: "No next step", hint: "Mid-funnel and next_step empty" },
];

const BUCKETS: { key: keyof HealthWeights; label: string; hint: string }[] = [
  { key: "bucketGreen", label: "Green threshold", hint: "Score ≥ this → green (healthy)" },
  { key: "bucketAmber", label: "Amber threshold", hint: "Score ≥ this → amber (watch), below → red" },
];

interface AiSpend {
  monthlyBudgetUsd: number;
  usdThisMonth: number;
  apiCallsThisMonth: number;
  cannedCallsThisMonth: number;
  inputTokensThisMonth: number;
  outputTokensThisMonth: number;
  model: string;
}

export default function HealthSettingsPage() {
  const [weights, setWeights] = useState<HealthWeights | null>(null);
  const [defaults, setDefaults] = useState<HealthWeights | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [spend, setSpend] = useState<AiSpend | null>(null);

  useEffect(() => {
    fetch("/api/settings/health")
      .then((r) => r.json())
      .then((d) => {
        setWeights(d.weights);
        setDefaults(d.defaults);
      })
      .catch(() => setError("Failed to load settings"));
    fetch("/api/ai-spend")
      .then((r) => r.json())
      .then((d: AiSpend) => setSpend(d))
      .catch(() => { /* non-blocking */ });
  }, []);

  const update = (key: keyof HealthWeights, value: string) => {
    if (!weights) return;
    const n = parseFloat(value);
    setWeights({ ...weights, [key]: Number.isFinite(n) ? n : 0 });
  };

  const save = async () => {
    if (!weights) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/health", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Save failed");
      } else {
        setSavedAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (defaults) setWeights({ ...defaults });
  };

  if (!weights) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-10">
        <p className="font-mono text-sm text-[var(--text-muted)]">loading…</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-mono text-lg font-semibold text-[var(--text-primary)] uppercase tracking-wider">
            Deal Health Weights
          </h1>
          <p className="font-mono text-xs text-[var(--text-muted)] mt-1">
            Tune how the 0–100 health score is computed. Starts at 100, subtracts penalties below.
          </p>
        </div>
        <Link
          href="/"
          className="font-mono text-[10px] px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          ← dashboard
        </Link>
      </div>

      {spend && <SpendCard spend={spend} />}

      <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5 space-y-4">
        <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Penalties
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="font-mono text-[11px] text-[var(--text-secondary)] block mb-1">
                {f.label}
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={weights[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                className="w-full font-mono text-sm px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
              <span className="font-mono text-[10px] text-[var(--text-muted)] block mt-0.5">
                {f.hint}
              </span>
            </label>
          ))}
        </div>

        <div className="border-t border-[var(--border-color)] pt-4">
          <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            Bucket thresholds
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BUCKETS.map((f) => (
              <label key={f.key} className="block">
                <span className="font-mono text-[11px] text-[var(--text-secondary)] block mb-1">
                  {f.label}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={weights[f.key]}
                  onChange={(e) => update(f.key, e.target.value)}
                  className="w-full font-mono text-sm px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
                <span className="font-mono text-[10px] text-[var(--text-muted)] block mt-0.5">
                  {f.hint}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="font-mono text-xs text-[var(--accent-red)] border border-[var(--accent-red)] bg-[var(--accent-red-dim)] px-3 py-2 rounded">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-4">
          <button
            onClick={reset}
            className="font-mono text-xs px-3 py-1.5 rounded border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            reset to defaults
          </button>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="font-mono text-[10px] text-[var(--accent-green)]">saved {savedAt}</span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="font-mono text-xs px-4 py-1.5 rounded border border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? "saving…" : "save"}
            </button>
          </div>
        </div>
      </div>

      <p className="font-mono text-[10px] text-[var(--text-muted)] mt-4">
        Changes take effect on the next dashboard refresh (auto-polls every 2 minutes).
      </p>
    </main>
  );
}

function SpendCard({ spend }: { spend: AiSpend }) {
  const pct = Math.min(100, (spend.usdThisMonth / spend.monthlyBudgetUsd) * 100);
  const overBudget = spend.usdThisMonth > spend.monthlyBudgetUsd;
  const barColor = overBudget
    ? "var(--accent-red)"
    : pct > 80
    ? "var(--accent-orange)"
    : "var(--accent-green)";
  const usd = spend.usdThisMonth >= 0.01
    ? `$${spend.usdThisMonth.toFixed(2)}`
    : spend.usdThisMonth > 0
    ? `<$0.01`
    : `$0.00`;

  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          AI Spend (this month)
        </h2>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          model: {spend.model}
        </span>
      </div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-mono text-2xl font-semibold" style={{ color: barColor }}>
          {usd}
        </span>
        <span className="font-mono text-xs text-[var(--text-muted)]">
          / ${spend.monthlyBudgetUsd.toFixed(2)} budget
        </span>
      </div>
      <div className="h-1.5 bg-[var(--bg-secondary)] rounded overflow-hidden mb-2">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <div className="font-mono text-[10px] text-[var(--text-muted)] flex flex-wrap gap-x-4 gap-y-1">
        <span>{spend.apiCallsThisMonth} Claude calls</span>
        <span>{spend.cannedCallsThisMonth} canned (closed deals — no API)</span>
        <span>
          {spend.inputTokensThisMonth.toLocaleString()} in /{" "}
          {spend.outputTokensThisMonth.toLocaleString()} out tokens
        </span>
      </div>
    </div>
  );
}
