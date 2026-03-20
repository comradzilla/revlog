-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================
-- Core tables
-- ============================================

-- Owners (sales reps)
CREATE TABLE IF NOT EXISTS owners (
    id TEXT PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    archived BOOLEAN DEFAULT false,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deals - current state
CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    deal_name TEXT NOT NULL,
    pipeline TEXT,
    pipeline_name TEXT,
    deal_stage TEXT,
    stage_name TEXT,
    amount NUMERIC(14,2) DEFAULT 0,
    close_date TIMESTAMPTZ,
    owner_id TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    stage_entered_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deals_pipeline ON deals(pipeline);
CREATE INDEX idx_deals_stage ON deals(deal_stage);
CREATE INDEX idx_deals_updated ON deals(updated_at DESC);
CREATE INDEX idx_deals_owner ON deals(owner_id);

-- ============================================
-- Changelog - every property change recorded
-- ============================================

CREATE TABLE IF NOT EXISTS deal_changelog (
    id BIGSERIAL,
    deal_id TEXT NOT NULL,
    deal_name TEXT NOT NULL,
    pipeline TEXT,
    pipeline_name TEXT,
    property TEXT NOT NULL,
    property_label TEXT,
    old_value TEXT,
    new_value TEXT,
    old_label TEXT,
    new_label TEXT,
    changed_at TIMESTAMPTZ NOT NULL,
    source_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable for time-series queries
SELECT create_hypertable('deal_changelog', 'changed_at', migrate_data => true);

CREATE INDEX idx_changelog_deal ON deal_changelog(deal_id, changed_at DESC);
CREATE INDEX idx_changelog_property ON deal_changelog(property, changed_at DESC);
CREATE INDEX idx_changelog_pipeline ON deal_changelog(pipeline, changed_at DESC);

-- ============================================
-- Pipeline snapshots - daily state capture
-- ============================================

CREATE TABLE IF NOT EXISTS pipeline_snapshots (
    snapshot_time TIMESTAMPTZ NOT NULL,
    pipeline TEXT NOT NULL,
    pipeline_name TEXT,
    stage TEXT NOT NULL,
    stage_name TEXT,
    deal_count INTEGER DEFAULT 0,
    total_value NUMERIC(14,2) DEFAULT 0,
    weighted_value NUMERIC(14,2) DEFAULT 0
);

SELECT create_hypertable('pipeline_snapshots', 'snapshot_time', migrate_data => true);

CREATE INDEX idx_snapshots_pipeline ON pipeline_snapshots(pipeline, snapshot_time DESC);

-- ============================================
-- Sync metadata - track sync state
-- ============================================

CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Useful views
-- ============================================

-- Pipeline summary (current)
CREATE VIEW pipeline_summary AS
SELECT
    pipeline,
    pipeline_name,
    deal_stage,
    stage_name,
    COUNT(*) AS deal_count,
    SUM(amount) AS total_value
FROM deals
GROUP BY pipeline, pipeline_name, deal_stage, stage_name
ORDER BY pipeline, deal_stage;

-- Recent changelog
CREATE VIEW recent_changelog AS
SELECT
    cl.*,
    o.first_name || ' ' || o.last_name AS owner_name
FROM deal_changelog cl
LEFT JOIN deals d ON d.id = cl.deal_id
LEFT JOIN owners o ON o.id = d.owner_id
ORDER BY cl.changed_at DESC;

-- Daily pipeline value (from snapshots)
CREATE VIEW daily_pipeline AS
SELECT
    time_bucket('1 day', snapshot_time) AS day,
    pipeline_name,
    SUM(deal_count) AS total_deals,
    SUM(total_value) AS total_value
FROM pipeline_snapshots
GROUP BY day, pipeline_name
ORDER BY day DESC;
