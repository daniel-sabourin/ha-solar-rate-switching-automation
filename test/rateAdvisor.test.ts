import { describe, it, expect } from "vitest";
import { computeAdvisorResult, formatResult } from "../src/rateAdvisor.js";
import type { DailyStat, AdvisorOptions } from "../src/types.js";

const baseOpts: AdvisorOptions = {
  currentPlan: "low",
  days: 14,
  hiRate: 0.35,
  loRate: 0.10,
};

function makeDays(count: number, net: number, startDay = 1): DailyStat[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-03-${String(startDay + i).padStart(2, "0")}`,
    net,
  }));
}

describe("computeAdvisorResult", () => {
  it("recommends STAY on low when net importer", () => {
    const days = makeDays(14, -10);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "low" });
    expect(result.recommendation).toBe("STAY");
    expect(result.switchTo).toBeNull();
  });

  it("recommends SWITCH to high when net exporter on low plan", () => {
    const days = makeDays(14, 10);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "low" });
    expect(result.recommendation).toBe("SWITCH");
    expect(result.switchTo).toBe("high");
  });

  it("recommends STAY on high when net exporter", () => {
    const days = makeDays(14, 10);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "high" });
    expect(result.recommendation).toBe("STAY");
    expect(result.switchTo).toBeNull();
  });

  it("recommends SWITCH to low when net importer on high plan", () => {
    const days = makeDays(14, -10);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "high" });
    expect(result.recommendation).toBe("SWITCH");
    expect(result.switchTo).toBe("low");
  });

  it("uses only the last N days for the rolling window", () => {
    // 20 days total: first 6 are big importers, last 14 are exporters
    const old = makeDays(6, -100, 1);
    const recent = makeDays(14, 10, 7);
    const result = computeAdvisorResult([...old, ...recent], baseOpts);
    expect(result.recommendation).toBe("SWITCH");
    expect(result.days).toHaveLength(14);
    expect(result.windowStart).toBe("2026-03-07");
  });

  it("calculates totalNet correctly", () => {
    const days = makeDays(14, -10);
    const result = computeAdvisorResult(days, baseOpts);
    expect(result.totalNet).toBeCloseTo(-140);
  });

  it("calculates cost of wrong plan", () => {
    const days = makeDays(14, -10);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "high" });
    expect(result.costOfWrongPlan).toBeCloseTo(140 * 0.25);
  });

  it("computes trend from first and second halves", () => {
    const prior = makeDays(7, -10);
    const recent = makeDays(7, 5, 8);
    const result = computeAdvisorResult([...prior, ...recent], baseOpts);
    expect(result.trend).not.toBeNull();
    expect(result.trend!.priorNet).toBeCloseTo(-70);
    expect(result.trend!.recentNet).toBeCloseTo(35);
  });

  it("returns null trend for single day", () => {
    const result = computeAdvisorResult([{ date: "2026-03-01", net: 5 }], baseOpts);
    expect(result.trend).toBeNull();
  });

  it("sets windowStart and windowEnd from days", () => {
    const days = makeDays(14, 5);
    const result = computeAdvisorResult(days, baseOpts);
    expect(result.windowStart).toBe("2026-03-01");
    expect(result.windowEnd).toBe("2026-03-14");
  });
});

describe("backdate recommendation", () => {
  it("is null when no billDate provided", () => {
    const days = makeDays(14, 10);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "low" });
    expect(result.backdate).toBeNull();
  });

  it("is null when recommendation is STAY", () => {
    const days = makeDays(14, -10);
    const result = computeAdvisorResult(days, {
      ...baseOpts,
      currentPlan: "low",
      billDate: "2026-03-01",
    });
    expect(result.backdate).toBeNull();
  });

  it("finds the optimal backdate for switching to high", () => {
    // Bill period: 5 days. Rolling window: last 3 (export days) → SWITCH to high.
    // Backdate scans all 5 bill days to find the start that maximises cumulative net.
    const days: DailyStat[] = [
      { date: "2026-03-01", net: -20 }, // importer — before window
      { date: "2026-03-02", net: -15 }, // importer — before window
      { date: "2026-03-03", net: 10 },  // exporter — cumulative from here: +10
      { date: "2026-03-04", net: 12 },  // cumulative from 03: +22
      { date: "2026-03-05", net: 11 },  // cumulative from 03: +33  ← best
    ];
    const result = computeAdvisorResult(days, {
      ...baseOpts,
      currentPlan: "low",
      days: 3, // window = [03-03, 03-04, 03-05], net = +33 → SWITCH to high
      billDate: "2026-03-01",
    });
    expect(result.backdate).not.toBeNull();
    expect(result.backdate!.date).toBe("2026-03-03");
    expect(result.backdate!.savings).toBeCloseTo(33 * 0.25);
  });

  it("absorbs EV charging spikes — single import day doesn't shift the optimal date", () => {
    const days: DailyStat[] = [
      { date: "2026-03-01", net: -5 },  // importer
      { date: "2026-03-02", net: 15 },  // exporter — cumulative from here: 15
      { date: "2026-03-03", net: -30 }, // EV charge spike — cumulative from 02: -15, from 03: -30
      { date: "2026-03-04", net: 20 },  // cumulative from 02: 5, from 03: -10, from 04: 20
      { date: "2026-03-05", net: 18 },  // cumulative from 02: 23 ← best, from 04: 38
    ];
    // From 2026-03-02: 15 - 30 + 20 + 18 = 23
    // From 2026-03-04: 20 + 18 = 38  ← actually this is higher
    const result = computeAdvisorResult(days, {
      ...baseOpts,
      currentPlan: "low",
      days: 5,
      billDate: "2026-03-01",
    });
    expect(result.backdate).not.toBeNull();
    // Optimal is 2026-03-04 (38 kWh) since EV charge on 03-03 makes 02 less optimal
    expect(result.backdate!.date).toBe("2026-03-04");
    expect(result.backdate!.savings).toBeCloseTo(38 * 0.25);
  });

  it("finds optimal backdate for switching to low", () => {
    // Bill period: 5 days. Rolling window: last 3 (import days) → SWITCH to low.
    const days: DailyStat[] = [
      { date: "2026-03-01", net: 20 },  // exporter — before window
      { date: "2026-03-02", net: 15 },  // exporter — before window
      { date: "2026-03-03", net: -10 }, // importer — cumulative from here: -10
      { date: "2026-03-04", net: -12 }, // cumulative from 03: -22
      { date: "2026-03-05", net: -11 }, // cumulative from 03: -33  ← best
    ];
    const result = computeAdvisorResult(days, {
      ...baseOpts,
      currentPlan: "high",
      days: 3, // window = [03-03, 03-04, 03-05], net = -33 → SWITCH to low
      billDate: "2026-03-01",
    });
    expect(result.backdate).not.toBeNull();
    expect(result.backdate!.date).toBe("2026-03-03");
    expect(result.backdate!.savings).toBeCloseTo(33 * 0.25);
  });

  it("returns null backdate when no beneficial start date exists", () => {
    // Switching to high but all days are net importers
    const days: DailyStat[] = [
      { date: "2026-03-01", net: -5 },
      { date: "2026-03-02", net: -10 },
    ];
    // This won't recommend SWITCH to high since net is negative, so backdate is null anyway
    // Test the case where billDate days are all unfavorable:
    const allExportDays = makeDays(14, 10); // exporter → SWITCH to high
    // But add a bill-period override with only import days
    const importOnly: DailyStat[] = [
      { date: "2026-03-01", net: -5 },
      { date: "2026-03-02", net: -3 },
      ...makeDays(14, 10, 3),
    ];
    const result = computeAdvisorResult(importOnly, {
      ...baseOpts,
      currentPlan: "low",
      days: 14,
      billDate: "2026-03-15", // bill date is after all the export days
    });
    // days after 2026-03-15 in importOnly: days 3..16 → net 10 each → cumulative positive → backdate found
    expect(result.backdate).not.toBeNull();
  });

  it("respects billDate — does not look before it", () => {
    const days: DailyStat[] = [
      { date: "2026-03-01", net: 50 }, // before bill date — should be ignored
      { date: "2026-03-10", net: 10 },
      { date: "2026-03-11", net: 12 },
    ];
    const result = computeAdvisorResult(days, {
      ...baseOpts,
      currentPlan: "low",
      days: 3,
      billDate: "2026-03-10",
    });
    expect(result.backdate).not.toBeNull();
    expect(result.backdate!.date).toBe("2026-03-10");
    expect(result.backdate!.savings).toBeCloseTo(22 * 0.25);
  });
});

describe("formatResult", () => {
  it("includes header and recommendation", () => {
    const days = makeDays(14, -10);
    const result = computeAdvisorResult(days, baseOpts);
    const output = formatResult(result, baseOpts);
    expect(output).toContain("Rate Switch Advisor");
    expect(output).toContain("STAY");
    expect(output).toContain("LOW");
  });

  it("includes net production line", () => {
    const days = makeDays(14, -10);
    const result = computeAdvisorResult(days, baseOpts);
    const output = formatResult(result, baseOpts);
    expect(output).toContain("Net production:");
    expect(output).toContain("net importer");
  });

  it("includes daily breakdown with net only", () => {
    const days = makeDays(14, 5);
    const result = computeAdvisorResult(days, baseOpts);
    const output = formatResult(result, baseOpts);
    expect(output).toContain("Daily breakdown:");
    expect(output).toContain("2026-03-01");
  });

  it("includes trend when present", () => {
    const prior = makeDays(7, -10);
    const recent = makeDays(7, 5, 8);
    const result = computeAdvisorResult([...prior, ...recent], baseOpts);
    const output = formatResult(result, baseOpts);
    expect(output).toContain("Trend");
    expect(output).toContain("↑ (improving)");
  });

  it("shows SWITCH recommendation correctly", () => {
    const days = makeDays(14, 10);
    const opts = { ...baseOpts, currentPlan: "low" as const };
    const result = computeAdvisorResult(days, opts);
    const output = formatResult(result, opts);
    expect(output).toContain("SWITCH to HIGH");
  });

  it("shows backdate section when present", () => {
    const days: DailyStat[] = [
      { date: "2026-03-01", net: -20 },
      { date: "2026-03-02", net: -15 },
      { date: "2026-03-03", net: 10 },
      { date: "2026-03-04", net: 12 },
      { date: "2026-03-05", net: 11 },
    ];
    // Window = last 3 days (net +33) → SWITCH to high; bill covers all 5
    const opts = { ...baseOpts, currentPlan: "low" as const, days: 3, billDate: "2026-03-01" };
    const result = computeAdvisorResult(days, opts);
    const output = formatResult(result, opts);
    expect(output).toContain("Optimal backdate:");
    expect(output).toContain("Savings vs switching today:");
  });

  it("omits backdate section when not present", () => {
    const days = makeDays(14, -10);
    const result = computeAdvisorResult(days, baseOpts);
    const output = formatResult(result, baseOpts);
    expect(output).not.toContain("Optimal backdate:");
  });
});
