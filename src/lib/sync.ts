import { query } from "./db";
import {
  getStageName,
  getPipelineName,
  type DealChange,
  type PropertyHistory,
} from "./hubspot";

const HUBSPOT_API = "https://api.hubapi.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// ============================================
// Sync owners
// ============================================
async function syncOwners() {
  const [activeRes, archivedRes] = await Promise.all([
    fetch(`${HUBSPOT_API}/crm/v3/owners?limit=100`, { headers: headers() }),
    fetch(`${HUBSPOT_API}/crm/v3/owners?limit=100&archived=true`, {
      headers: headers(),
    }),
  ]);

  for (const [res, archived] of [
    [activeRes, false],
    [archivedRes, true],
  ] as const) {
    if (!res.ok) continue;
    const data = await res.json();
    for (const owner of data.results) {
      await query(
        `INSERT INTO owners (id, first_name, last_name, email, archived, synced_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           email = EXCLUDED.email,
           archived = EXCLUDED.archived,
           synced_at = NOW()`,
        [
          owner.id,
          owner.firstName || "",
          owner.lastName || "",
          owner.email || "",
          archived,
        ]
      );
    }
  }
}

// ============================================
// Sync deals + changelog
// ============================================
async function fetchAllDeals(): Promise<DealChange[]> {
  const allDeals: DealChange[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const body = {
      sorts: [
        { propertyName: "hs_lastmodifieddate", direction: "DESCENDING" },
      ],
      properties: [
        "dealname",
        "dealstage",
        "amount",
        "pipeline",
        "hubspot_owner_id",
        "closedate",
        "hs_lastmodifieddate",
        "hs_v2_date_entered_current_stage",
      ],
      limit,
      after: offset > 0 ? offset : undefined,
    };

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) break;
    const data = await res.json();

    for (const deal of data.results) {
      allDeals.push({
        id: deal.id,
        dealName: deal.properties.dealname || "Unnamed Deal",
        pipeline: deal.properties.pipeline || "",
        pipelineName: getPipelineName(deal.properties.pipeline || ""),
        currentStage: deal.properties.dealstage || "",
        currentStageName: getStageName(deal.properties.dealstage || ""),
        stageNumber: 0,
        amount: parseFloat(deal.properties.amount || "0"),
        closeDate: deal.properties.closedate || null,
        lastModified: deal.properties.hs_lastmodifieddate,
        stageEnteredDate:
          deal.properties.hs_v2_date_entered_current_stage || null,
        createdAt: deal.properties.createdate,
        ownerName: "",
        ownerId: deal.properties.hubspot_owner_id || null,
      });
    }

    if (!data.paging?.next?.after) break;
    offset = parseInt(data.paging.next.after);
  }

  return allDeals;
}

async function syncDeals() {
  const deals = await fetchAllDeals();

  for (const deal of deals) {
    await query(
      `INSERT INTO deals (id, deal_name, pipeline, pipeline_name, deal_stage, stage_name, amount, close_date, owner_id, created_at, updated_at, stage_entered_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (id) DO UPDATE SET
         deal_name = EXCLUDED.deal_name,
         pipeline = EXCLUDED.pipeline,
         pipeline_name = EXCLUDED.pipeline_name,
         deal_stage = EXCLUDED.deal_stage,
         stage_name = EXCLUDED.stage_name,
         amount = EXCLUDED.amount,
         close_date = EXCLUDED.close_date,
         owner_id = EXCLUDED.owner_id,
         updated_at = EXCLUDED.updated_at,
         stage_entered_at = EXCLUDED.stage_entered_at,
         synced_at = NOW()`,
      [
        deal.id,
        deal.dealName,
        deal.pipeline,
        deal.pipelineName,
        deal.currentStage,
        deal.currentStageName,
        deal.amount,
        deal.closeDate,
        (deal as DealChange & { ownerId?: string }).ownerId || null,
        deal.createdAt,
        deal.lastModified,
        deal.stageEnteredDate,
      ]
    );
  }

  return deals.length;
}

// ============================================
// Sync property history → changelog
// ============================================
async function syncChangelog(dealIds: string[]) {
  // Get the last synced changelog timestamp
  const lastSyncResult = await query(
    "SELECT value FROM sync_meta WHERE key = 'last_changelog_sync'"
  );
  const lastSync = lastSyncResult.rows[0]?.value || "1970-01-01T00:00:00Z";

  let newEntries = 0;

  // Process in batches of 5 to respect rate limits
  for (let i = 0; i < dealIds.length; i += 5) {
    const batch = dealIds.slice(i, i + 5);

    const promises = batch.map(async (dealId) => {
      const res = await fetch(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}?propertiesWithHistory=dealstage,amount&properties=dealname,pipeline`,
        { headers: headers() }
      );

      if (!res.ok) return;
      const data = await res.json();

      const dealName = data.properties?.dealname || "Unknown";
      const pipeline = data.properties?.pipeline || "";
      const pipelineName = getPipelineName(pipeline);

      for (const prop of ["dealstage", "amount"]) {
        const history: PropertyHistory[] =
          data.propertiesWithHistory?.[prop] || [];

        for (let j = 0; j < history.length - 1; j++) {
          const entry = history[j];
          const prev = history[j + 1];

          // Skip entries we've already synced
          if (entry.timestamp <= lastSync) continue;

          const isStage = prop === "dealstage";
          const oldLabel = isStage
            ? getStageName(prev.value)
            : `$${parseFloat(prev.value || "0").toLocaleString()}`;
          const newLabel = isStage
            ? getStageName(entry.value)
            : `$${parseFloat(entry.value || "0").toLocaleString()}`;

          // Skip if values are the same
          if (prev.value === entry.value) continue;

          await query(
            `INSERT INTO deal_changelog (deal_id, deal_name, pipeline, pipeline_name, property, property_label, old_value, new_value, old_label, new_label, changed_at, source_type)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
             WHERE NOT EXISTS (
               SELECT 1 FROM deal_changelog
               WHERE deal_id = $1 AND property = $5 AND changed_at = $11
             )`,
            [
              dealId,
              dealName,
              pipeline,
              pipelineName,
              prop,
              isStage ? "Deal Stage" : "Deal Amount",
              prev.value,
              entry.value,
              oldLabel,
              newLabel,
              entry.timestamp,
              entry.sourceType || "UNKNOWN",
            ]
          );
          newEntries++;
        }
      }
    });

    await Promise.all(promises);
  }

  // Update sync timestamp
  await query(
    `INSERT INTO sync_meta (key, value, updated_at)
     VALUES ('last_changelog_sync', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [new Date().toISOString()]
  );

  return newEntries;
}

// ============================================
// Capture pipeline snapshot
// ============================================
async function capturePipelineSnapshot() {
  await query(
    `INSERT INTO pipeline_snapshots (snapshot_time, pipeline, pipeline_name, stage, stage_name, deal_count, total_value)
     SELECT
       NOW(),
       pipeline,
       pipeline_name,
       deal_stage,
       stage_name,
       COUNT(*)::integer,
       COALESCE(SUM(amount), 0)
     FROM deals
     WHERE pipeline IS NOT NULL AND deal_stage IS NOT NULL
     GROUP BY pipeline, pipeline_name, deal_stage, stage_name`
  );
}

// ============================================
// Full sync orchestrator
// ============================================
export async function runFullSync(): Promise<{
  owners: string;
  deals: number;
  changelog: number;
  snapshot: boolean;
}> {
  console.log("[sync] Starting full HubSpot sync...");

  // 1. Sync owners
  console.log("[sync] Syncing owners...");
  await syncOwners();

  // 2. Sync deals
  console.log("[sync] Syncing deals...");
  const dealCount = await syncDeals();

  // 3. Get recently modified deal IDs for changelog sync
  // Only sync changelog for deals modified in last 30 days to avoid rate limits
  const recentDeals = await query(
    `SELECT id FROM deals WHERE updated_at > NOW() - INTERVAL '30 days' ORDER BY updated_at DESC LIMIT 50`
  );
  const dealIds = recentDeals.rows.map((r: { id: string }) => r.id);

  // 4. Sync changelog
  console.log(`[sync] Syncing changelog for ${dealIds.length} recent deals...`);
  const changelogCount = await syncChangelog(dealIds);

  // 5. Capture pipeline snapshot
  console.log("[sync] Capturing pipeline snapshot...");
  await capturePipelineSnapshot();

  // 6. Update sync timestamp
  await query(
    `INSERT INTO sync_meta (key, value, updated_at)
     VALUES ('last_full_sync', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [new Date().toISOString()]
  );

  console.log(
    `[sync] Complete. ${dealCount} deals, ${changelogCount} changelog entries.`
  );

  return {
    owners: "synced",
    deals: dealCount,
    changelog: changelogCount,
    snapshot: true,
  };
}
