-- Track token spend per generated summary so we can roll up actual API cost
-- against the monthly budget. Canned (closed-deal) summaries store 0/0 and
-- model='canned' so they don't pollute the spend rollup.
ALTER TABLE deal_ai_summaries
  ADD COLUMN IF NOT EXISTS input_tokens  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0;
