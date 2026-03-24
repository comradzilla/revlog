"use client";

import { ThemeToggle } from "./ThemeToggle";

function timeAgoShort(isoString: string | null): string {
  if (!isoString) return "never";
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export interface SyncMeta {
  lastIncremental: string | null;
  lastFull: string | null;
}

export function StatusBar({
  lastUpdated,
  isLoading,
  onRefresh,
  syncMeta,
}: {
  lastUpdated: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  syncMeta?: SyncMeta | null;
}) {
  return (
    <header className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm sticky top-0 z-50 transition-colors duration-300">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] pulse-dot" />
            <span className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">
              Live
            </span>
          </div>
          <div className="h-4 w-px bg-[var(--border-color)] hidden sm:block" />
          <h1 className="font-mono text-sm font-semibold text-[var(--text-primary)]">
            <span className="text-[var(--accent-blue)]">$</span> pipeline
            <span className="text-[var(--text-muted)]">/</span>changelog
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sync tier timestamps */}
          {syncMeta && (
            <span className="font-mono text-[10px] text-[var(--text-muted)] hidden sm:inline">
              <span className="text-[var(--accent-green)]">incr</span>:{" "}
              {timeAgoShort(syncMeta.lastIncremental)}
              <span className="mx-1">·</span>
              <span className="text-[var(--accent-blue)]">full</span>:{" "}
              {timeAgoShort(syncMeta.lastFull)}
            </span>
          )}
          {!syncMeta && lastUpdated && (
            <span className="font-mono text-xs text-[var(--text-muted)] hidden sm:inline">
              synced {lastUpdated}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="font-mono text-xs px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-active)] text-[var(--text-secondary)] transition-all disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <svg
                  className="animate-spin h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                syncing...
              </span>
            ) : (
              "refresh"
            )}
          </button>
          <div className="h-4 w-px bg-[var(--border-color)] hidden sm:block" />
          <ThemeToggle />
          <div className="h-4 w-px bg-[var(--border-color)] hidden sm:block" />
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="font-mono text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors cursor-pointer"
            title="Logout"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
