"use client";

import type { HealthBucket, HealthPenalty } from "@/lib/health";

interface Props {
  score: number | null;
  bucket: HealthBucket;
  penalties?: HealthPenalty[];
  size?: "sm" | "md";
}

const COLORS: Record<HealthBucket, { fg: string; bg: string }> = {
  green: { fg: "var(--accent-green)", bg: "var(--accent-green-dim)" },
  amber: { fg: "var(--accent-orange)", bg: "var(--accent-orange-dim)" },
  red:   { fg: "var(--accent-red)",    bg: "var(--accent-red-dim)" },
  closed:{ fg: "var(--text-muted)",    bg: "var(--bg-secondary)" },
};

export function HealthBadge({ score, bucket, penalties, size = "sm" }: Props) {
  if (score === null || bucket === "closed") return null;
  const { fg, bg } = COLORS[bucket];
  const sizing = size === "md" ? "text-[11px] px-2 py-0.5" : "text-[10px] px-1.5 py-0.5";

  return (
    <span className="relative group inline-flex shrink-0">
      <span
        className={`font-mono ${sizing} rounded border cursor-help tabular-nums`}
        style={{ color: fg, borderColor: fg, backgroundColor: bg }}
        aria-label={`Health score ${score} out of 100`}
      >
        {score}
      </span>
      {penalties && penalties.length > 0 && (
        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-64 px-3 py-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] font-mono text-[10px] leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg pointer-events-none">
          <div className="flex items-center justify-between mb-1.5 border-b border-[var(--border-color)] pb-1">
            <span className="text-[var(--text-primary)]">Health {score}/100</span>
            <span style={{ color: fg }}>
              {bucket === "green" ? "Healthy" : bucket === "amber" ? "Watch" : "At Risk"}
            </span>
          </div>
          <ul className="space-y-0.5">
            {penalties.map((p) => (
              <li key={p.code} className="flex items-start gap-2">
                <span className="shrink-0" style={{ color: fg }}>−{p.amount}</span>
                <span className="flex-1">{p.label}</span>
              </li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
}
