const HUBSPOT_API = "https://api.hubapi.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// Stage label mappings
const STAGE_LABELS: Record<string, string> = {
  // Growth Pipeline
  "1166852615": "01 - Prospecting",
  "1166852616": "02 - Qualification",
  "1166852617": "03 - Solutioning",
  "1166852618": "04 - Proposal",
  "1166852619": "05 - Negotiation",
  "1166852620": "06 - Closed Won",
  "14039891": "00 - Closed Lost",
  // Renewal Pipeline
  "15424275": "01 - Account Review",
  "15424273": "02 - Validate",
  "56953899": "03 - Propose",
  "15424276": "04 - Negotiate",
  "15424278": "05 - Closed Won / Renewed",
  "15424279": "00 - Closed Lost / Churn",
  // Renewal Pipeline (alt)
  "1312718091": "BAU",
  "1312718097": "Price Increase Notice",
  "1312718092": "Renewal Nudge",
  "1312718093": "Notice Nudge",
  "1312718094": "Negotiation",
  "1312718095": "Renewed",
  "1312718096": "Closed Lost",
  // Partner Leads
  "224212800": "01 - Prospect",
  "224212801": "02 - Exploration",
  "224212802": "03 - Qualified Prospect",
  "227590167": "04 - SAO Confirmed",
  "224212806": "00 - Closed Lost",
  // VS - Sales
  "1312827533": "01 - Prospecting",
  "1312827535": "02 - Qualification",
  "1312827528": "03 - Solutioning",
  "1312827529": "04 - Proposal",
  "1312827530": "05 - Negotiation",
  "1312827531": "Closed Won",
  "1312827532": "Closed Lost",
  // Legacy stage IDs (from property history)
  closedwon: "Closed Won",
  closedlost: "Closed Lost",
  contractsent: "Contract Sent",
  presentationscheduled: "Presentation Scheduled",
  qualifiedtobuy: "Qualified to Buy",
  decisionmakerboughtin: "Decision Maker Bought In",
  appointmentscheduled: "Appointment Scheduled",
};

const PIPELINE_LABELS: Record<string, string> = {
  "4207989": "Growth",
  "4762460": "Renewal",
  "128577389": "Partner Leads",
  "875966339": "VS - Sales",
  "875968058": "VS - Renewal",
};

export function getStageName(stageId: string): string {
  return STAGE_LABELS[stageId] || stageId;
}

export function getPipelineName(pipelineId: string): string {
  return PIPELINE_LABELS[pipelineId] || pipelineId;
}

export function getStageNumber(stageId: string): number {
  const label = STAGE_LABELS[stageId] || "";
  const match = label.match(/^(\d+)/);
  return match ? parseInt(match[1]) : -1;
}

export interface DealChange {
  id: string;
  dealName: string;
  pipeline: string;
  pipelineName: string;
  currentStage: string;
  currentStageName: string;
  stageNumber: number;
  amount: number;
  closeDate: string | null;
  lastModified: string;
  stageEnteredDate: string | null;
  createdAt: string;
  ownerName: string;
  ownerId?: string;
  dealType?: string;
}

export interface PropertyHistory {
  timestamp: string;
  value: string;
  sourceType: string;
  sourceId: string;
}

export interface DealChangelog {
  dealId: string;
  dealName: string;
  pipeline: string;
  pipelineName: string;
  property: string;
  propertyLabel: string;
  oldValue: string;
  newValue: string;
  oldLabel: string;
  newLabel: string;
  timestamp: string;
  sourceType: string;
}

// Fetch recently modified deals
export async function getRecentDeals(limit = 50): Promise<DealChange[]> {
  const body = {
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
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
  };

  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`);
  const data = await res.json();

  // Batch fetch owner names
  const ownerIds = [
    ...new Set(
      data.results
        .map((d: any) => d.properties.hubspot_owner_id)
        .filter(Boolean)
    ),
  ];
  const ownerMap = await getOwnerNames(ownerIds as string[]);

  return data.results.map((deal: any) => ({
    id: deal.id,
    dealName: deal.properties.dealname || "Unnamed Deal",
    pipeline: deal.properties.pipeline || "",
    pipelineName: getPipelineName(deal.properties.pipeline || ""),
    currentStage: deal.properties.dealstage || "",
    currentStageName: getStageName(deal.properties.dealstage || ""),
    stageNumber: getStageNumber(deal.properties.dealstage || ""),
    amount: parseFloat(deal.properties.amount || "0"),
    closeDate: deal.properties.closedate || null,
    lastModified: deal.properties.hs_lastmodifieddate,
    stageEnteredDate: deal.properties.hs_v2_date_entered_current_stage || null,
    createdAt: deal.properties.createdate,
    ownerName:
      ownerMap[deal.properties.hubspot_owner_id] || "Unassigned",
  }));
}

// Fetch property history for a deal (stage changes + amount changes)
export async function getDealPropertyHistory(
  dealId: string,
  property: string
): Promise<PropertyHistory[]> {
  const res = await fetch(
    `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}?propertiesWithHistory=${property}`,
    { headers: headers() }
  );

  if (!res.ok) return [];
  const data = await res.json();
  return data.propertiesWithHistory?.[property] || [];
}

// Process history in batches to avoid HubSpot rate limits
async function batchProcess<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = 5
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// Get changelog: fetch recent deals then get their property history
export async function getDealChangelogs(
  limit = 15
): Promise<DealChangelog[]> {
  const deals = await getRecentDeals(limit);
  const changelogs: DealChangelog[] = [];

  // Fetch history in batches of 5 to avoid rate limits
  await batchProcess(
    deals,
    async (deal) => {
      const res = await fetch(
        `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}?propertiesWithHistory=dealstage,amount`,
        { headers: headers() }
      );

      if (!res.ok) return;
      const data = await res.json();

      const stageHistory: PropertyHistory[] =
        data.propertiesWithHistory?.dealstage || [];
      const amountHistory: PropertyHistory[] =
        data.propertiesWithHistory?.amount || [];

      // Process stage changes
      for (let i = 0; i < stageHistory.length - 1; i++) {
        changelogs.push({
          dealId: deal.id,
          dealName: deal.dealName,
          pipeline: deal.pipeline,
          pipelineName: deal.pipelineName,
          property: "dealstage",
          propertyLabel: "Deal Stage",
          oldValue: stageHistory[i + 1].value,
          newValue: stageHistory[i].value,
          oldLabel: getStageName(stageHistory[i + 1].value),
          newLabel: getStageName(stageHistory[i].value),
          timestamp: stageHistory[i].timestamp,
          sourceType: stageHistory[i].sourceType,
        });
      }

      // Process amount changes
      for (let i = 0; i < amountHistory.length - 1; i++) {
        const oldAmt = amountHistory[i + 1].value;
        const newAmt = amountHistory[i].value;
        if (oldAmt !== newAmt) {
          changelogs.push({
            dealId: deal.id,
            dealName: deal.dealName,
            pipeline: deal.pipeline,
            pipelineName: deal.pipelineName,
            property: "amount",
            propertyLabel: "Deal Amount",
            oldValue: oldAmt,
            newValue: newAmt,
            oldLabel: `$${parseFloat(oldAmt || "0").toLocaleString()}`,
            newLabel: `$${parseFloat(newAmt || "0").toLocaleString()}`,
            timestamp: amountHistory[i].timestamp,
            sourceType: amountHistory[i].sourceType,
          });
        }
      }
    },
    5
  );

  // Sort by timestamp descending
  changelogs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return changelogs;
}

// Get pipeline summary stats
export async function getPipelineStats() {
  const stages = [
    "1166852615",
    "1166852616",
    "1166852617",
    "1166852618",
    "1166852619",
    "1166852620",
    "14039891",
  ];

  const stageCountPromises = stages.map(async (stageId) => {
    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: "dealstage", operator: "EQ", value: stageId },
            { propertyName: "pipeline", operator: "EQ", value: "4207989" },
          ],
        },
      ],
      properties: ["amount"],
      limit: 1,
    };

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) return { stageId, count: 0, label: getStageName(stageId) };
    const data = await res.json();
    return {
      stageId,
      count: data.total || 0,
      label: getStageName(stageId),
    };
  });

  return Promise.all(stageCountPromises);
}

// Fetch open pipeline value
export async function getOpenPipelineValue() {
  const openStages = [
    "1166852615",
    "1166852616",
    "1166852617",
    "1166852618",
    "1166852619",
  ];

  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "dealstage",
            operator: "IN",
            values: openStages,
          },
          { propertyName: "pipeline", operator: "EQ", value: "4207989" },
        ],
      },
    ],
    properties: ["amount", "dealstage", "dealname"],
    limit: 200,
  };

  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) return { totalValue: 0, count: 0, deals: [] };
  const data = await res.json();

  const totalValue = data.results.reduce(
    (sum: number, d: any) => sum + parseFloat(d.properties.amount || "0"),
    0
  );

  return { totalValue, count: data.total || 0, deals: data.results };
}

// Fetch owner names (active + archived)
async function getOwnerNames(
  ownerIds: string[]
): Promise<Record<string, string>> {
  if (ownerIds.length === 0) return {};

  const [activeRes, archivedRes] = await Promise.all([
    fetch(`${HUBSPOT_API}/crm/v3/owners?limit=100`, { headers: headers() }),
    fetch(`${HUBSPOT_API}/crm/v3/owners?limit=100&archived=true`, {
      headers: headers(),
    }),
  ]);

  const map: Record<string, string> = {};

  for (const res of [activeRes, archivedRes]) {
    if (!res.ok) continue;
    const data = await res.json();
    for (const owner of data.results) {
      map[owner.id] =
        `${owner.firstName || ""} ${owner.lastName || ""}`.trim();
    }
  }

  return map;
}
