"use client";

import { useState, useEffect } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem("dashboard-theme") || "terminal";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        window.location.href = "/";
      } else {
        const data = await res.json();
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] transition-colors duration-300">
      <div className="w-full max-w-sm mx-4">
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)] rounded-lg p-8">
          {/* Terminal prompt header */}
          <div className="mb-8">
            <p className="font-mono text-sm text-[var(--text-muted)]">
              <span className="text-[var(--accent-blue)]">$</span> revradar.io
            </p>
            <p className="font-mono text-xs text-[var(--text-muted)] mt-1">
              pipeline intelligence dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-mono text-xs text-[var(--text-muted)] mb-2">
                enter access code
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                className="w-full font-mono text-sm px-3 py-2.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="font-mono text-xs text-[var(--accent-red)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full font-mono text-xs px-4 py-2.5 rounded border border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue)] hover:text-[var(--bg-primary)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? "authenticating..." : "→ login"}
            </button>
          </form>
        </div>

        <p className="font-mono text-[10px] text-[var(--text-muted)] text-center mt-4">
          revradar · pipeline changelog
        </p>
      </div>
    </div>
  );
}
