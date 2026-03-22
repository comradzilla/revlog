"use client";

import { useEffect, useState, type ReactNode } from "react";

type Theme = "terminal" | "chromatic" | "light";

const THEMES: { key: Theme; label: string; icon: ReactNode }[] = [
  {
    key: "terminal",
    label: "Terminal",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    key: "chromatic",
    label: "Console",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    key: "light",
    label: "Light",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    ),
  },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("terminal");

  useEffect(() => {
    const saved = localStorage.getItem("ceo-dashboard-theme") as Theme | null;
    if (saved && ["terminal", "chromatic", "light"].includes(saved)) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const switchTheme = (t: Theme) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("ceo-dashboard-theme", t);
  };

  return (
    <div className="theme-toggle-group" title="Color theme">
      {THEMES.map((t) => (
        <button
          key={t.key}
          onClick={() => switchTheme(t.key)}
          className={`theme-toggle-btn ${theme === t.key ? "active" : ""}`}
          title={t.label}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
