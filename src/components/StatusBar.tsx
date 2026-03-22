"use client";

import { ThemeToggle } from "./ThemeToggle";

export function StatusBar({
  lastUpdated,
  isLoading,
  onRefresh,
}: {
  lastUpdated: string | null;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm sticky top-0 z-50 transition-colors duration-300">
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] pulse-dot" />
            <span className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">
              Live
            </span>
          </div>
          <div className="h-4 w-px bg-[var(--border-color)]" />
          <h1 className="font-mono text-sm font-semibold text-[var(--text-primary)]">
            <span className="text-[var(--accent-blue)]">$</span> pipeline
            <span className="text-[var(--text-muted)]">/</span>changelog
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="font-mono text-xs text-[var(--text-muted)]">
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
          <div className="h-4 w-px bg-[var(--border-color)]" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
