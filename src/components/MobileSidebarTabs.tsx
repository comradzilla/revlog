"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  key: string;
  label: string;
  content: ReactNode;
}

export function MobileSidebarTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key || "");

  return (
    <div className="lg:hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--border-color)] mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`flex-1 font-mono text-[11px] py-2.5 text-center uppercase tracking-wider transition-colors cursor-pointer ${
              active === tab.key
                ? "text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {tabs.find((t) => t.key === active)?.content}
    </div>
  );
}
