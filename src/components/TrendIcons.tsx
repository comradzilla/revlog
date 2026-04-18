"use client";

import { sizeOf, momentumOf, type SizeTier, type Momentum, type SizeTiers, type MomentumSignals, type HealthBucket } from "@/lib/health";

// Three glanceable icons summarizing a deal at a glance:
//   ♥  HEALTH    — color from the composite health bucket
//   $  SIZE      — 1/2/3 dollar signs from amount tier
//   ↑  MOMENTUM  — direction of recent change (regressions, slips, amount net)

interface Props {
  // Health bucket from the existing CTE. If null/closed → heart hidden.
  bucket?: HealthBucket | null;
  amount: number;
  // Optional override for size tiers (defaults from health.ts).
  sizeTiers?: SizeTiers;
  // Signals used to compute momentum. If absent, momentum arrow is hidden.
  momentumSignals?: MomentumSignals;
  // Tooltip text override; defaults to a human-readable summary.
  title?: string;
  // Visual sizing.
  compact?: boolean;
}

const HEALTH_COLOR: Record<HealthBucket, string> = {
  green: "var(--accent-green)",
  amber: "var(--accent-orange)",
  red:   "var(--accent-red)",
  closed:"var(--text-muted)",
};

const SIZE_LABEL: Record<SizeTier, string> = {
  small: "$",
  medium: "$$",
  large: "$$$",
};

const SIZE_COLOR: Record<SizeTier, string> = {
  small:  "var(--text-muted)",
  medium: "var(--text-secondary)",
  large:  "var(--accent-green)",
};

const MOMENTUM_GLYPH: Record<Momentum, string> = {
  up:   "↑",
  flat: "→",
  down: "↓",
};

const MOMENTUM_COLOR: Record<Momentum, string> = {
  up:   "var(--accent-green)",
  flat: "var(--text-muted)",
  down: "var(--accent-red)",
};

const MOMENTUM_LABEL: Record<Momentum, string> = {
  up:   "trending up",
  flat: "flat / no recent change",
  down: "trending down",
};

export function TrendIcons({
  bucket,
  amount,
  sizeTiers,
  momentumSignals,
  title,
  compact = true,
}: Props) {
  const tier = sizeOf(amount, sizeTiers);
  const momentum: Momentum | null = momentumSignals ? momentumOf(momentumSignals) : null;
  const sizing = compact ? "text-[10px] gap-1" : "text-xs gap-1.5";

  const heartVisible = bucket && bucket !== "closed";
  const heartTitle = heartVisible ? `health: ${bucket}` : "";
  const sizeTitle = `size: ${tier} ($${formatK(amount)})`;
  const momentumTitle = momentum ? MOMENTUM_LABEL[momentum] : "";
  const fullTitle = title ?? [heartTitle, sizeTitle, momentumTitle].filter(Boolean).join(" · ");

  return (
    <span
      className={`inline-flex items-center font-mono leading-none shrink-0 ${sizing}`}
      title={fullTitle}
      aria-label={fullTitle}
    >
      {heartVisible && (
        <span style={{ color: HEALTH_COLOR[bucket as HealthBucket] }} aria-hidden="true">♥</span>
      )}
      <span style={{ color: SIZE_COLOR[tier] }} aria-hidden="true">{SIZE_LABEL[tier]}</span>
      {momentum && (
        <span style={{ color: MOMENTUM_COLOR[momentum] }} aria-hidden="true">{MOMENTUM_GLYPH[momentum]}</span>
      )}
    </span>
  );
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
