-- Cache for Claude-generated deal narratives. One row per deal; upserted
-- on regeneration. `based_on_changed_at` is the newest deal_changelog.changed_at
-- at generation time — the lookup compares this against the current value to
-- decide whether the cache is still valid.
CREATE TABLE IF NOT EXISTS deal_ai_summaries (
  deal_id              TEXT PRIMARY KEY,
  summary_text         TEXT NOT NULL,
  based_on_changed_at  TIMESTAMPTZ,
  model                TEXT,
  generated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
