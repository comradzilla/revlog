// Shared SQL query helper functions used by both /api/hubspot and /api/analytics routes.
// Extracted to avoid duplication.

export const UPSELL_TYPES = ["existingbusiness", "existing_business"];
export const NEW_BIZ_TYPES = ["newbusiness", "new_business"];

// Stage weights for weighted pipeline (mirrors hubspot.ts STAGE_WEIGHTS)
export const STAGE_WEIGHT_MAP: Record<string, number> = {
  // Growth Pipeline
  "1166852615": 0.10, "1166852616": 0.25, "1166852617": 0.50,
  "1166852618": 0.70, "1166852619": 0.90,
  // VS - Sales Pipeline
  "1312827533": 0.10, "1312827535": 0.25, "1312827528": 0.50,
  "1312827529": 0.70, "1312827530": 0.90,
  // Partner Leads Pipeline
  "224212800": 0.10, "224212801": 0.25, "224212802": 0.50, "227590167": 0.70,
};

export type QueryParams = (string | number | Date | string[])[];

export function parseQuarters(q: string | null): { start: Date; end: Date }[] {
  if (!q) return [];
  return q.split(",").map(part => {
    const match = part.trim().match(/^(\d{4})-Q([1-4])$/);
    if (!match) return null;
    const year = parseInt(match[1]);
    const quarter = parseInt(match[2]);
    const startMonth = (quarter - 1) * 3;
    return {
      start: new Date(year, startMonth, 1),
      end: new Date(year, startMonth + 3, 1),
    };
  }).filter(Boolean) as { start: Date; end: Date }[];
}

export function quarterCondition(
  quarters: { start: Date; end: Date }[],
  column: string,
  params: QueryParams
): string {
  if (quarters.length === 0) return "";
  if (quarters.length === 1) {
    params.push(quarters[0].start.toISOString(), quarters[0].end.toISOString());
    return `${column} >= $${params.length - 1} AND ${column} < $${params.length}`;
  }
  const parts = quarters.map(q => {
    params.push(q.start.toISOString(), q.end.toISOString());
    return `(${column} >= $${params.length - 1} AND ${column} < $${params.length})`;
  });
  return `(${parts.join(" OR ")})`;
}

export function dealTypeCondition(
  dtFilter: string | null,
  column: string,
  params: QueryParams
): string {
  if (!dtFilter || dtFilter === "all") return "";
  if (dtFilter === "upsell") {
    params.push(UPSELL_TYPES);
    return `${column} = ANY($${params.length})`;
  }
  if (dtFilter === "newbusiness") {
    params.push(NEW_BIZ_TYPES);
    return `${column} = ANY($${params.length})`;
  }
  params.push(dtFilter);
  return `${column} = $${params.length}`;
}

export function pipelineCondition(
  pFilter: string | null,
  column: string,
  params: QueryParams
): string {
  if (!pFilter || pFilter === "all") return "";
  const ids = pFilter.split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return "";
  if (ids.length === 1) {
    params.push(ids[0]);
    return `${column} = $${params.length}`;
  }
  params.push(ids);
  return `${column} = ANY($${params.length})`;
}

export function ownerCondition(
  ownerFilter: string | null,
  column: string,
  params: QueryParams
): string {
  if (!ownerFilter || ownerFilter === "all") return "";
  const ids = ownerFilter.split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return "";
  if (ids.length === 1) {
    params.push(ids[0]);
    return `${column} = $${params.length}`;
  }
  params.push(ids);
  return `${column} = ANY($${params.length})`;
}

/** Detect stage regression from label prefixes (e.g., "05 - Negotiation" → "02 - Qualification") */
export function isStageRegression(oldLabel: string, newLabel: string): boolean {
  const oldMatch = oldLabel.match(/^(\d+)/);
  const newMatch = newLabel.match(/^(\d+)/);
  if (!oldMatch || !newMatch) return false;
  const oldNum = parseInt(oldMatch[1]);
  const newNum = parseInt(newMatch[1]);
  if (newNum === 0) return false; // Closed Lost is not regression
  return newNum < oldNum;
}

/** Build WHERE conditions array into a single WHERE clause string */
export function buildWhereClause(conditions: string[]): string {
  const filtered = conditions.filter(Boolean);
  return filtered.length > 0 ? `WHERE ${filtered.join(" AND ")}` : "";
}

/** Build date range condition from start/end ISO strings */
export function dateRangeCondition(
  start: string | null,
  end: string | null,
  column: string,
  params: QueryParams
): string {
  if (!start || !end) return "";
  params.push(start, end);
  return `${column} >= $${params.length - 1} AND ${column} < $${params.length}`;
}
