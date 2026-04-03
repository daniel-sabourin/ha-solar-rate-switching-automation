import type { DailyStat, AdvisorOptions, AdvisorResult, BackdateRecommendation } from "./types.js";

function sumNet(days: DailyStat[]): number {
  return days.reduce((acc, d) => acc + d.net, 0);
}

/**
 * Scans backward from the last day to find the start date that maximizes
 * cumulative net in the direction of the target plan.
 * EV charging spikes (single high-import days) are absorbed into the total —
 * only the overall cumulative sum determines the optimal date.
 */
function findOptimalBackdate(
  days: DailyStat[],
  switchTo: "high" | "low",
  rateDiff: number
): BackdateRecommendation | null {
  if (days.length === 0) return null;

  // high → want max positive net; low → want max negative net (flip sign)
  const sign = switchTo === "high" ? 1 : -1;

  let bestSum = 0; // must exceed 0 to be worth backdating
  let bestDate: string | null = null;
  let runningSum = 0;

  for (let i = days.length - 1; i >= 0; i--) {
    runningSum += sign * days[i].net;
    if (runningSum > bestSum) {
      bestSum = runningSum;
      bestDate = days[i].date;
    }
  }

  if (!bestDate) return null;

  return { date: bestDate, savings: bestSum * rateDiff };
}

export function computeAdvisorResult(
  allDays: DailyStat[],
  opts: AdvisorOptions
): AdvisorResult {
  // Rolling window uses only the last N days
  const windowDays = allDays.slice(-opts.days);

  const totalNet = sumNet(windowDays);

  // totalNet > 0 → net exporter → high rate better
  // totalNet < 0 → net importer → low rate better
  const betterPlan: "high" | "low" = totalNet > 0 ? "high" : "low";
  const recommendation: "SWITCH" | "STAY" =
    betterPlan === opts.currentPlan ? "STAY" : "SWITCH";
  const switchTo = recommendation === "SWITCH" ? betterPlan : null;

  const rateDiff = opts.hiRate - opts.loRate;
  const costOfWrongPlan = Math.abs(totalNet) * rateDiff;

  let trend: AdvisorResult["trend"] = null;
  if (windowDays.length >= 2) {
    const mid = Math.floor(windowDays.length / 2);
    trend = {
      priorNet: sumNet(windowDays.slice(0, mid)),
      recentNet: sumNet(windowDays.slice(mid)),
    };
  }

  // Backdate: scan all days since bill date (may extend before the rolling window)
  let backdate: BackdateRecommendation | null = null;
  if (opts.billDate && switchTo) {
    const billDays = allDays.filter((d) => d.date >= opts.billDate!);
    backdate = findOptimalBackdate(billDays, switchTo, rateDiff);
  }

  return {
    windowStart: windowDays[0]?.date ?? "",
    windowEnd: windowDays[windowDays.length - 1]?.date ?? "",
    days: windowDays,
    totalNet,
    recommendation,
    switchTo,
    costOfWrongPlan,
    trend,
    backdate,
  };
}

const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function trendArrow(prior: number, recent: number): string {
  if (recent > prior + 0.1) return "↑ (improving)";
  if (recent < prior - 0.1) return "↓ (worsening)";
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

  const netLabel = result.totalNet >= 0 ? "net exporter" : "net importer";
  const sign = result.totalNet >= 0 ? "+" : "";
  lines.push(`  Net production:  ${sign}${fmt(result.totalNet)} kWh (${netLabel})`);
  lines.push("");

  if (result.recommendation === "STAY") {
    lines.push(`Recommendation: STAY on ${opts.currentPlan.toUpperCase()}`);
    const reason =
      opts.currentPlan === "high"
        ? "exports must exceed imports to benefit from high rate"
        : "imports must exceed exports to benefit from low rate";
    lines.push(`  (${reason})`);
  } else {
    lines.push(`Recommendation: SWITCH to ${result.switchTo!.toUpperCase()}`);
  }
  lines.push("");

  const rateDiff = opts.hiRate - opts.loRate;
  const wrongPlan = opts.currentPlan === "high" ? "LOW" : "HIGH";
  lines.push(
    `Cost of being on wrong plan: ~$${fmt(result.costOfWrongPlan, 2)} over this window`
  );
  lines.push(
    `  (if you switched to ${wrongPlan}, you'd pay ${fmt(rateDiff * 100, 0)}c/kWh × ${fmt(Math.abs(result.totalNet))} kWh more)`
  );

  if (result.trend) {
    const { priorNet, recentNet } = result.trend;
    const priorSign = priorNet >= 0 ? "+" : "";
    const recentSign = recentNet >= 0 ? "+" : "";
    const dir = trendArrow(priorNet, recentNet);
    lines.push("");
    lines.push(
      `Trend (first half vs second half): net  ${priorSign}${fmt(priorNet)} → ${recentSign}${fmt(recentNet)} kWh  ${dir}`
    );
  }

  if (result.backdate) {
    lines.push("");
    lines.push(`Optimal backdate: ${result.backdate.date}`);
    lines.push(
      `  Savings vs switching today: ~$${fmt(result.backdate.savings, 2)}`
    );
  }

  lines.push("");
  lines.push("Daily breakdown:");
  lines.push("  Date          Net");
  for (const d of result.days) {
    const s = d.net >= 0 ? "+" : "";
    const netStr = (s + fmt(d.net)).padStart(8);
    const row = `  ${d.date}  ${d.net >= 0 ? c.green(netStr) : c.red(netStr)}`;
    lines.push(row);
  }

  lines.push("");
  if (result.recommendation === "STAY") {
    lines.push(c.bold(`Recommendation: STAY on ${opts.currentPlan.toUpperCase()}`));
  } else {
    lines.push(c.bold(`Recommendation: SWITCH to ${result.switchTo!.toUpperCase()}`));
  }

  return lines.join("\n");
}
