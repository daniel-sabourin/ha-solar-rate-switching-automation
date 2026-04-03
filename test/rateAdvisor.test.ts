import { describe, it, expect } from "vitest";
import { computeAdvisorResult, formatResult } from "../src/rateAdvisor.js";
import type { DailyStat, AdvisorOptions } from "../src/types.js";

const baseOpts: AdvisorOptions = {
  currentPlan: "low",
  days: 14,
  hiRate: 0.35,
  loRate: 0.10,
};

function makeDays(count: number, imp: number, exp: number): DailyStat[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, "0")}`,
    import: imp,
    export: exp,
  }));
}

describe("computeAdvisorResult", () => {
  it("recommends STAY on low when net importer", () => {
    const days = makeDays(14, 20, 10);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "low" });
    expect(result.recommendation).toBe("STAY");
    expect(result.switchTo).toBeNull();
  });

  it("recommends SWITCH to high when net exporter on low plan", () => {
    const days = makeDays(14, 10, 20);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "low" });
    expect(result.recommendation).toBe("SWITCH");
    expect(result.switchTo).toBe("high");
  });

  it("recommends STAY on high when net exporter", () => {
    const days = makeDays(14, 10, 20);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "high" });
    expect(result.recommendation).toBe("STAY");
    expect(result.switchTo).toBeNull();
  });

  it("recommends SWITCH to low when net importer on high plan", () => {
    const days = makeDays(14, 20, 10);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "high" });
    expect(result.recommendation).toBe("SWITCH");
    expect(result.switchTo).toBe("low");
  });

  it("calculates totals correctly", () => {
    const days = makeDays(14, 20, 10);
    const result = computeAdvisorResult(days, baseOpts);
    expect(result.totalImport).toBeCloseTo(14 * 20);
    expect(result.totalExport).toBeCloseTo(14 * 10);
    expect(result.net).toBeCloseTo(14 * 10); // 140 kWh net import
  });

  it("calculates cost of wrong plan", () => {
    const days = makeDays(14, 20, 10);
    // net = 140 kWh, rateDiff = 0.25
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "high" });
    expect(result.costOfWrongPlan).toBeCloseTo(140 * 0.25);
  });

  it("computes trend when enough days", () => {
    // Prior 7 days: export/import = 10/20 = 0.5
    // Recent 7 days: export/import = 15/20 = 0.75
    const prior = makeDays(7, 20, 10);
    const recent = makeDays(7, 20, 15).map((d, i) => ({
      ...d,
      date: `2026-03-${String(i + 8).padStart(2, "0")}`,
    }));
    const result = computeAdvisorResult([...prior, ...recent], baseOpts);
    expect(result.trend).not.toBeNull();
    expect(result.trend!.priorRatio).toBeCloseTo(0.5);
    expect(result.trend!.recentRatio).toBeCloseTo(0.75);
  });

  it("returns null trend for empty days", () => {
    const result = computeAdvisorResult([], baseOpts);
    expect(result.trend).toBeNull();
  });

  it("sets windowStart and windowEnd from days", () => {
    const days = makeDays(14, 20, 10);
    const result = computeAdvisorResult(days, baseOpts);
    expect(result.windowStart).toBe("2026-03-01");
    expect(result.windowEnd).toBe("2026-03-14");
  });
});

describe("formatResult", () => {
  it("includes header and recommendation", () => {
    const days = makeDays(14, 20, 10);
    const result = computeAdvisorResult(days, baseOpts);
    const output = formatResult(result, baseOpts);
    expect(output).toContain("Rate Switch Advisor");
    expect(output).toContain("STAY");
    expect(output).toContain("LOW");
  });

  it("includes daily breakdown", () => {
    const days = makeDays(14, 20, 10);
    const result = computeAdvisorResult(days, baseOpts);
    const output = formatResult(result, baseOpts);
    expect(output).toContain("Daily breakdown:");
    expect(output).toContain("2026-03-01");
  });

  it("includes trend when present", () => {
    const prior = makeDays(7, 20, 10);
    const recent = makeDays(7, 20, 15).map((d, i) => ({
      ...d,
      date: `2026-03-${String(i + 8).padStart(2, "0")}`,
    }));
    const result = computeAdvisorResult([...prior, ...recent], baseOpts);
    const output = formatResult(result, baseOpts);
    expect(output).toContain("Trend");
    expect(output).toContain("E/I ratio");
  });

  it("shows SWITCH recommendation correctly", () => {
    const days = makeDays(14, 10, 20);
    const result = computeAdvisorResult(days, { ...baseOpts, currentPlan: "low" });
    const output = formatResult(result, { ...baseOpts, currentPlan: "low" });
    expect(output).toContain("SWITCH to HIGH");
  });
});
