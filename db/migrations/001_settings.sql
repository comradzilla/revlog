-- Generic key/value settings store. Currently holds health_weights; future
-- keys can live here too (UI preferences, feature flags) without new tables.
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
