import type { DailyStat, AdvisorOptions, AdvisorResult } from "./types.js";

function sum(days: DailyStat[], field: "import" | "export"): number {
  return days.reduce((acc, d) => acc + d[field], 0);
}

function exportImportRatio(days: DailyStat[]): number {
  const imp = sum(days, "import");
  return imp === 0 ? 0 : sum(days, "export") / imp;
}

export function computeAdvisorResult(
  days: DailyStat[],
  opts: AdvisorOptions
): AdvisorResult {
  const totalImport = sum(days, "import");
  const totalExport = sum(days, "export");
  const net = totalImport - totalExport;

  // net < 0 → exporter → high rate better
  // net > 0 → importer → low rate better
  const betterPlan: "high" | "low" = net < 0 ? "high" : "low";
  const recommendation: "SWITCH" | "STAY" =
    betterPlan === opts.currentPlan ? "STAY" : "SWITCH";
  const switchTo = recommendation === "SWITCH" ? betterPlan : null;

  const rateDiff = opts.hiRate - opts.loRate;
  const costOfWrongPlan = Math.abs(net) * rateDiff;

  // Trend: only if we have at least 14 days
  let trend: AdvisorResult["trend"] = null;
  if (days.length >= 14) {
    const mid = Math.floor(days.length / 2);
    const prior = days.slice(0, mid);
    const recent = days.slice(mid);
    trend = {
      priorRatio: exportImportRatio(prior),
      recentRatio: exportImportRatio(recent),
    };
  } else if (days.length >= 2) {
    const mid = Math.floor(days.length / 2);
    const prior = days.slice(0, mid);
    const recent = days.slice(mid);
    trend = {
      priorRatio: exportImportRatio(prior),
      recentRatio: exportImportRatio(recent),
    };
  }

  const windowStart = days[0]?.date ?? "";
  const windowEnd = days[days.length - 1]?.date ?? "";

  return {
    windowStart,
    windowEnd,
    days,
    totalImport,
    totalExport,
    net,
    recommendation,
    switchTo,
    costOfWrongPlan,
    trend,
  };
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function arrow(prior: number, recent: number): string {
  if (recent > prior + 0.01) return "↑ (improving)";
  if (recent < prior - 0.01) return "↓ (worsening)";
  return "→ (stable)";
}

export function formatResult(result: AdvisorResult, opts: AdvisorOptions): string {
  const lines: string[] = [];

  lines.push("Rate Switch Advisor");
  lines.push("===================");
  lines.push(
    `Window: ${result.windowStart} → ${result.windowEnd}  (${result.days.length} days)`
  );
  lines.push(`Current plan: ${opts.currentPlan.toUpperCase()}`);
  lines.push("");

  const netLabel = result.net <= 0 ? "net exporter" : "net importer";
  lines.push(`  Imported:  ${fmt(result.totalImport)} kWh`);
  lines.push(`  Exported:  ${fmt(result.totalExport)} kWh`);
  lines.push(`  Net:       ${fmt(result.net)} kWh (${netLabel})`);
  lines.push("");

  if (result.recommendation === "STAY") {
    lines.push(`Recommendation: STAY on ${opts.currentPlan.toUpperCase()}`);
    const reason =
      opts.currentPlan === "high"
        ? "exports must exceed imports to benefit from high rate"
        : "imports must exceed exports to benefit from low rate";
    lines.push(`  (${reason})`);
  } else {
    lines.push(
      `Recommendation: SWITCH to ${result.switchTo!.toUpperCase()}`
    );
  }
  lines.push("");

  const rateDiff = opts.hiRate - opts.loRate;
  lines.push(
    `Cost of being on wrong plan: ~$${fmt(result.costOfWrongPlan, 2)} over this window`
  );
  lines.push(
    `  (if you switched to ${
      opts.currentPlan === "high" ? "LOW" : "HIGH"
    }, you'd pay ${fmt(rateDiff * 100, 0)}c/kWh × ${fmt(Math.abs(result.net))} kWh more)`
  );

  if (result.trend) {
    const { priorRatio, recentRatio } = result.trend;
    const dir = arrow(priorRatio, recentRatio);
    lines.push("");
    lines.push(
      `Trend (last 7d vs prior 7d): E/I ratio  ${fmt(priorRatio, 2)} → ${fmt(
        recentRatio,
        2
      )}  ${dir}`
    );
  }

  lines.push("");
  lines.push("Daily breakdown:");
  lines.push("  Date        Import   Export   Net");
  for (const d of result.days) {
    const net = d.export - d.import;
    const sign = net >= 0 ? "+" : "";
    lines.push(
      `  ${d.date}  ${fmt(d.import).padStart(6)}   ${fmt(d.export).padStart(6)}   ${(sign + fmt(net)).padStart(6)}`
    );
  }

  return lines.join("\n");
}
