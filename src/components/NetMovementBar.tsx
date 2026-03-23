"use client";

interface NetMovement {
  created: { count: number; value: number };
  won: { count: number; value: number };
  lost: { count: number; value: number };
  net: number;
}

interface AmountMovement {
  grew: number;
  shrank: number;
  net: number;
}

function formatDollars(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

export function NetMovementBar({
  movement,
  amountMovement,
}: {
  movement: NetMovement | null;
  amountMovement: AmountMovement | null;
}) {
  if (!movement && !amountMovement) return null;

  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-5 py-3">
      <div className="flex items-center gap-6 flex-wrap font-mono text-xs">
        {/* Pipeline flow */}
        {movement && (
          <>
            <span className="text-[var(--text-muted)] uppercase text-[10px]">Pipeline Flow</span>
            <span className="text-[var(--accent-blue)]">
              +{formatDollars(movement.created.value)}
              <span className="text-[var(--text-muted)] ml-1">created ({movement.created.count})</span>
            </span>
            <span className="text-[var(--accent-green)]">
              {formatDollars(movement.won.value)}
              <span className="text-[var(--text-muted)] ml-1">won ({movement.won.count})</span>
            </span>
            <span className="text-[var(--accent-red)]">
              -{formatDollars(movement.lost.value)}
              <span className="text-[var(--text-muted)] ml-1">lost ({movement.lost.count})</span>
            </span>
            <span className={`font-bold ${movement.net >= 0 ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
              net: {movement.net >= 0 ? "+" : "-"}{formatDollars(movement.net)}
            </span>
          </>
        )}

        {/* Separator */}
        {movement && amountMovement && (
          <span className="h-4 w-px bg-[var(--border-color)]" />
        )}

        {/* Amount changes */}
        {amountMovement && (amountMovement.grew > 0 || amountMovement.shrank > 0) && (
          <>
            <span className="text-[var(--text-muted)] uppercase text-[10px]">Deal Values</span>
            <span className="text-[var(--accent-green)]">
              +{formatDollars(amountMovement.grew)}
              <span className="text-[var(--text-muted)] ml-1">grew</span>
            </span>
            <span className="text-[var(--accent-red)]">
              -{formatDollars(amountMovement.shrank)}
              <span className="text-[var(--text-muted)] ml-1">shrank</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
