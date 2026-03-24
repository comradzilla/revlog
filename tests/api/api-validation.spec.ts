import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000/api/hubspot";

test.describe("API Validation", () => {
  test("1.1: pipeline-value response shape and non-negative values", async ({ request }) => {
    const res = await request.get(`${BASE}?type=pipeline-value`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.totalValue).toBeGreaterThanOrEqual(0);
    expect(data.count).toBeGreaterThanOrEqual(0);
  });

  test("1.2: pipeline-value with filters returns subset", async ({ request }) => {
    // First get unfiltered
    const unfilteredRes = await request.get(`${BASE}?type=pipeline-value`);
    const unfiltered = await unfilteredRes.json();

    // Then get filtered
    const filteredRes = await request.get(`${BASE}?type=pipeline-value&quarter=2026-Q1`);
    const filtered = await filteredRes.json();

    if (filtered.filteredValue !== null) {
      expect(filtered.filteredValue).toBeLessThanOrEqual(unfiltered.totalValue);
    }
    if (filtered.filteredCount !== null) {
      expect(filtered.filteredCount).toBeLessThanOrEqual(unfiltered.count);
    }
  });

  test("1.3: closed-won non-negative", async ({ request }) => {
    const res = await request.get(`${BASE}?type=closed-won&quarter=2026-Q1`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.totalValue).toBeGreaterThanOrEqual(0);
    expect(data.count).toBeGreaterThanOrEqual(0);
  });

  test("1.4: closed-lost non-negative", async ({ request }) => {
    const res = await request.get(`${BASE}?type=closed-lost&quarter=2026-Q1`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.totalValue).toBeGreaterThanOrEqual(0);
    expect(data.count).toBeGreaterThanOrEqual(0);
  });

  test("1.5: net-movement arithmetic (net = created - won - lost)", async ({ request }) => {
    const res = await request.get(`${BASE}?type=net-movement&quarter=2026-Q1`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const expected = data.created.value - data.won.value - data.lost.value;
    expect(data.net).toBeCloseTo(expected, 0);
  });

  test("1.6: pipeline-ledger response shape", async ({ request }) => {
    const res = await request.get(`${BASE}?type=pipeline-ledger&quarter=2026-Q1`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    expect(typeof data.currentBalance).toBe("number");
    expect(Array.isArray(data.transactions)).toBeTruthy();

    const validTypes = ["amount_change", "deal_created", "closed_won", "closed_lost", "reopened"];
    for (const txn of data.transactions.slice(0, 10)) {
      expect(txn).toHaveProperty("dealId");
      expect(txn).toHaveProperty("dealName");
      expect(txn).toHaveProperty("type");
      expect(txn).toHaveProperty("delta");
      expect(txn).toHaveProperty("timestamp");
      expect(txn).toHaveProperty("balance");
      expect(validTypes).toContain(txn.type);
    }
  });

  test("1.7: pipeline-ledger running balance consistency", async ({ request }) => {
    const res = await request.get(`${BASE}?type=pipeline-ledger&quarter=2026-Q1`);
    const data = await res.json();

    if (data.transactions.length === 0) {
      test.skip();
      return;
    }

    // Re-walk the balance from the anchor
    let runningBalance = data.quarterBalance ?? data.currentBalance;
    for (const txn of data.transactions) {
      expect(txn.balance).toBeCloseTo(runningBalance, 0);
      runningBalance -= txn.delta;
    }
  });

  test("1.8: pipeline-ledger anchor matches pipeline-value", async ({ request }) => {
    const [ledgerRes, valueRes] = await Promise.all([
      request.get(`${BASE}?type=pipeline-ledger`),
      request.get(`${BASE}?type=pipeline-value`),
    ]);
    const ledger = await ledgerRes.json();
    const value = await valueRes.json();

    expect(ledger.currentBalance).toBeCloseTo(value.totalValue, 0);
  });

  test("1.9: changelog entries in descending timestamp order", async ({ request }) => {
    const res = await request.get(`${BASE}?type=changelog&quarter=2026-Q1&limit=50`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    const timestamps = data.changelogs.map((c: { timestamp: string }) => new Date(c.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
    }
  });

  test("1.10: amount-movement arithmetic (net = grew - shrank)", async ({ request }) => {
    const res = await request.get(`${BASE}?type=amount-movement&quarter=2026-Q1`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const expected = data.grew - data.shrank;
    expect(data.net).toBeCloseTo(expected, 0);
  });
});
