import { query } from "./db";
import {
  getStageName,
  getPipelineName,
  STAGE_WEIGHTS,
  type DealChange,
  type PropertyHistory,
} from "./hubspot";

const HUBSPOT_API = "https://api.hubapi.com";

const DEAL_PROPERTIES = [
  "dealname", "dealstage", "amount", "pipeline", "hubspot_owner_id",
  "closedate", "hs_lastmodifieddate", "hs_v2_date_entered_current_stage", "dealtype",
];

const TRACKED_HISTORY_PROPS = ["dealstage", "amount", "closedate", "hubspot_owner_id"];

function headers() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function parseDeal(deal: Record<string, Record<string, string>>): DealChange {
  const p = deal.properties;
  return {
    id: deal.id as unknown as string,
    dealName: p.dealname || "Unnamed Deal",
    pipeline: p.pipeline || "",
    pipelineName: getPipelineName(p.pipeline || ""),
    currentStage: p.dealstage || "",
    currentStageName: getStageName(p.dealstage || ""),
    stageNumber: 0,
    amount: parseFloat(p.amount || "0"),
    closeDate: p.closedate || null,
    lastModified: p.hs_lastmodifieddate,
    stageEnteredDate: p.hs_v2_date_entered_current_stage || null,
    createdAt: p.createdate,
    ownerName: "",
    ownerId: p.hubspot_owner_id || undefined,
    dealType: p.dealtype || undefined,
  };
}

async function upsertDeal(deal: DealChange) {
  await query(
    `INSERT INTO deals (id, deal_name, pipeline, pipeline_name, deal_stage, stage_name, amount, close_date, owner_id, created_at, updated_at, stage_entered_at, deal_type, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
     ON CONFLICT (id) DO UPDATE SET
       deal_name = EXCLUDED.deal_name, pipeline = EXCLUDED.pipeline,
       pipeline_name = EXCLUDED.pipeline_name, deal_stage = EXCLUDED.deal_stage,
       stage_name = EXCLUDED.stage_name, amount = EXCLUDED.amount,
       close_date = EXCLUDED.close_date, owner_id = EXCLUDED.owner_id,
       updated_at = EXCLUDED.updated_at, stage_entered_at = EXCLUDED.stage_entered_at,
       deal_type = EXCLUDED.deal_type, synced_at = NOW()`,
    [
      deal.id, deal.dealName, deal.pipeline, deal.pipelineName,
      deal.currentStage, deal.currentStageName, deal.amount, deal.closeDate,
      deal.ownerId || null, deal.createdAt, deal.lastModified,
      deal.stageEnteredDate, deal.dealType || null,
    ]
  );
}

// ============================================
// Shared: Owner name lookup
// ============================================
async function getOwnerMap(): Promise<Record<string, string>> {
  const result = await query("SELECT id, first_name, last_name FROM owners");
  const map: Record<string, string> = {};
  for (const row of result.rows) {
    map[row.id] = `${row.first_name} ${row.last_name}`.trim() || "Unknown";
  }
  return map;
}

// ============================================
// Shared: Sync owners (active + archived)
// ============================================
async function syncOwners() {
  const [activeRes, archivedRes] = await Promise.all([
    fetch(`${HUBSPOT_API}/crm/v3/owners?limit=100`, { headers: headers() }),
    fetch(`${HUBSPOT_API}/crm/v3/owners?limit=100&archived=true`, { headers: headers() }),
  ]);

  for (const [res, archived] of [[activeRes, false], [archivedRes, true]] as const) {
    if (!res.ok) continue;
    const data = await res.json();
    for (const owner of data.results) {
      await query(
        `INSERT INTO owners (id, first_name, last_name, email, archived, synced_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET
           first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
           email = EXCLUDED.email, archived = EXCLUDED.archived, synced_at = NOW()`,
        [owner.id, owner.firstName || "", owner.lastName || "", owner.email || "", archived]
      );
    }
  }
}

// ============================================
// Shared: Sync changelog for specific deal IDs
// ============================================
async function syncChangelog(dealIds: string[], sinceTimestamp: string) {
  const ownerMap = await getOwnerMap();
  let newEntries = 0;

  for (let i = 0; i < dealIds.length; i += 5) {
    const batch = dealIds.slice(i, i + 5);

    const promises = batch.map(async (dealId) => {
      const res = await fetch(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}?propertiesWithHistory=${TRACKED_HISTORY_PROPS.join(",")}&properties=dealname,pipeline`,
        { headers: headers() }
      );

      if (!res.ok) return;
      const data = await res.json();

      const dealName = data.properties?.dealname || "Unknown";
      const pipeline = data.properties?.pipeline || "";
      const pipelineName = getPipelineName(pipeline);

      for (const prop of TRACKED_HISTORY_PROPS) {
        const history: PropertyHistory[] = data.propertiesWithHistory?.[prop] || [];

        for (let j = 0; j < history.length - 1; j++) {
          const entry = history[j];
          const prev = history[j + 1];

          if (entry.timestamp <= sinceTimestamp) continue;
          if (prev.value === entry.value) continue;

          let propertyLabel: string, oldLabel: string, newLabel: string;

          if (prop === "dealstage") {
            propertyLabel = "Deal Stage";
            oldLabel = getStageName(prev.value);
            newLabel = getStageName(entry.value);
          } else if (prop === "amount") {
            propertyLabel = "Deal Amount";
            oldLabel = `$${parseFloat(prev.value || "0").toLocaleString()}`;
            newLabel = `$${parseFloat(entry.value || "0").toLocaleString()}`;
          } else if (prop === "closedate") {
            propertyLabel = "Close Date";
            oldLabel = prev.value ? new Date(prev.value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "None";
            newLabel = entry.value ? new Date(entry.value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "None";
          } else {
            propertyLabel = "Deal Owner";
            oldLabel = ownerMap[prev.value] || prev.value || "Unassigned";
            newLabel = ownerMap[entry.value] || entry.value || "Unassigned";
          }

          await query(
            `INSERT INTO deal_changelog (deal_id, deal_name, pipeline, pipeline_name, property, property_label, old_value, new_value, old_label, new_label, changed_at, source_type)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
             WHERE NOT EXISTS (
               SELECT 1 FROM deal_changelog WHERE deal_id = $1 AND property = $5 AND changed_at = $11
             )`,
            [dealId, dealName, pipeline, pipelineName, prop, propertyLabel,
             prev.value, entry.value, oldLabel, newLabel, entry.timestamp, entry.sourceType || "UNKNOWN"]
          );
          newEntries++;
        }
      }
    });

    await Promise.all(promises);
  }

  return newEntries;
}

// ============================================
// Shared: Sync deal creation events
// ============================================
async function syncDealCreations(sinceTimestamp: string) {
  const result = await query(
    `INSERT INTO deal_changelog (deal_id, deal_name, pipeline, pipeline_name, property, property_label, old_value, new_value, old_label, new_label, changed_at, source_type)
     SELECT d.id, d.deal_name, d.pipeline, d.pipeline_name,
            'created', 'Deal Created', NULL, d.deal_stage, NULL,
            d.stage_name || CASE WHEN d.amount > 0 THEN ' — $' || TRIM(TO_CHAR(d.amount, '999,999,999')) ELSE '' END,
            d.created_at, 'CREATION'
     FROM deals d
     WHERE d.created_at IS NOT NULL AND d.created_at > $1
       AND NOT EXISTS (SELECT 1 FROM deal_changelog WHERE deal_id = d.id AND property = 'created')
     RETURNING deal_id`,
    [sinceTimestamp]
  );
  return result.rowCount || 0;
}

// ============================================
// Shared: Capture pipeline snapshot
// ============================================
async function capturePipelineSnapshot() {
  const weightCases = Object.entries(STAGE_WEIGHTS)
    .map(([stageId, weight]) => `WHEN deal_stage = '${stageId}' THEN ${weight}`)
    .join("\n          ");

  await query(
    `INSERT INTO pipeline_snapshots (snapshot_time, pipeline, pipeline_name, stage, stage_name, deal_count, total_value, weighted_value)
     SELECT NOW(), pipeline, pipeline_name, deal_stage, stage_name,
       COUNT(*)::integer, COALESCE(SUM(amount), 0),
       COALESCE(SUM(amount * CASE ${weightCases} ELSE 0.0 END), 0)
     FROM deals WHERE pipeline IS NOT NULL AND deal_stage IS NOT NULL
     GROUP BY pipeline, pipeline_name, deal_stage, stage_name`
  );
}

// ============================================
// Update sync_meta helper
// ============================================
async function updateSyncMeta(key: string) {
  await query(
    `INSERT INTO sync_meta (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, new Date().toISOString()]
  );
}

async function getSyncMeta(key: string): Promise<string> {
  const result = await query("SELECT value FROM sync_meta WHERE key = $1", [key]);
  return result.rows[0]?.value || "1970-01-01T00:00:00Z";
}

// ============================================
// TIER 1: Incremental Sync
// Fast (~2-3s). Only fetches deals changed since last sync.
// ============================================
export async function runIncrementalSync(): Promise<{
  tier: "incremental";
  dealsChanged: number;
  changelog: number;
  creations: number;
}> {
  const lastSync = await getSyncMeta("last_incremental_sync");
  const lastSyncMs = new Date(lastSync).getTime();

  console.log(`[sync:incremental] Starting. Last sync: ${lastSync}`);

  // Query HubSpot for deals modified since last sync
  const body = {
    filterGroups: [{
      filters: [{
        propertyName: "hs_lastmodifieddate",
        operator: "GTE",
        value: String(lastSyncMs),
      }],
    }],
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    properties: DEAL_PROPERTIES,
    limit: 100,
  };

  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[sync:incremental] HubSpot API error: ${res.status}`);
    return { tier: "incremental", dealsChanged: 0, changelog: 0, creations: 0 };
  }

  const data = await res.json();
  const changedDeals = (data.results || []).map(parseDeal);

  console.log(`[sync:incremental] ${changedDeals.length} deals changed since last sync`);

  // Upsert changed deals
  for (const deal of changedDeals) {
    await upsertDeal(deal);
  }

  // Fetch property history only for changed deals
  let changelogCount = 0;
  if (changedDeals.length > 0) {
    const dealIds = changedDeals.map((d: DealChange) => d.id);
    changelogCount = await syncChangelog(dealIds, lastSync);
  }

  // Creation events for new deals
  const creationCount = await syncDealCreations(lastSync);

  // Capture snapshot (DB-only, cheap)
  await capturePipelineSnapshot();

  // Update timestamps
  await updateSyncMeta("last_incremental_sync");
  await updateSyncMeta("last_changelog_sync");

  console.log(
    `[sync:incremental] Done. ${changedDeals.length} deals, ${changelogCount} changelog, ${creationCount} creations`
  );

  return {
    tier: "incremental",
    dealsChanged: changedDeals.length,
    changelog: changelogCount,
    creations: creationCount,
  };
}

// ============================================
// TIER 2: Full Sync
// Thorough (~60-90s). Re-syncs everything.
// Daily safety net + first-run bootstrap.
// ============================================
export async function runFullSync(): Promise<{
  tier: "full";
  owners: string;
  deals: number;
  changelog: number;
  creations: number;
  snapshot: boolean;
}> {
  console.log("[sync:full] Starting full HubSpot sync...");

  // 1. Sync owners (daily cadence — they rarely change)
  console.log("[sync:full] Syncing owners...");
  await syncOwners();

  // 2. Full deal scan (all pages) — uses LIST endpoint, not search
  console.log("[sync:full] Syncing all deals...");
  const allDeals: DealChange[] = [];
  let after: string | undefined = undefined;

  while (true) {
    const params = new URLSearchParams({
      limit: "100",
      properties: DEAL_PROPERTIES.join(","),
    });
    if (after) params.set("after", after);

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals?${params}`, {
      headers: headers(),
    });

    if (!res.ok) {
      console.error(`[sync:full] List deals failed: ${res.status}`);
      break;
    }
    const data = await res.json();

    for (const deal of data.results) {
      allDeals.push(parseDeal(deal));
    }

    console.log(`[sync:full] Fetched ${allDeals.length} deals so far...`);

    if (!data.paging?.next?.after) break;
    after = data.paging.next.after;
  }

  for (const deal of allDeals) {
    await upsertDeal(deal);
  }

  // 3. Extended changelog: all deals modified in last 7 days (no artificial limit)
  const recentDeals = await query(
    `SELECT id FROM deals WHERE updated_at > NOW() - INTERVAL '7 days' ORDER BY updated_at DESC`
  );
  const dealIds = recentDeals.rows.map((r: { id: string }) => r.id);

  const lastSync = await getSyncMeta("last_changelog_sync");
  console.log(`[sync:full] Syncing changelog for ${dealIds.length} deals modified in last 7 days...`);
  const changelogCount = await syncChangelog(dealIds, lastSync);

  // 4. Creation events
  const lastCreationSync = await getSyncMeta("last_creation_sync");
  const creationCount = await syncDealCreations(lastCreationSync);

  // 5. Pipeline snapshot
  await capturePipelineSnapshot();

  // 6. Update all timestamps
  await updateSyncMeta("last_full_sync");
  await updateSyncMeta("last_incremental_sync");
  await updateSyncMeta("last_changelog_sync");
  await updateSyncMeta("last_creation_sync");

  console.log(
    `[sync:full] Complete. ${allDeals.length} deals, ${changelogCount} changelog, ${creationCount} creations`
  );

  return {
    tier: "full",
    owners: "synced",
    deals: allDeals.length,
    changelog: changelogCount,
    creations: creationCount,
    snapshot: true,
  };
}
