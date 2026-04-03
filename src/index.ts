import "dotenv/config";
import { loadConfig } from "./config.js";
import { fetchDailyStats } from "./ha.js";
import { computeAdvisorResult, formatResult } from "./rateAdvisor.js";
import type { AdvisorOptions } from "./types.js";

function parseArgs(argv: string[]): { subcommand: string; args: string[] } {
  const [, , subcommand, ...rest] = argv;
  return { subcommand: subcommand ?? "", args: rest };
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function requireFlag(args: string[], flag: string, label: string): string {
  const val = getFlag(args, flag);
  if (!val) {
    console.error(`Error: ${flag} <${label}> is required`);
    process.exit(1);
  }
  return val;
}

async function runAdvisor(args: string[]): Promise<void> {
  const currentPlanRaw = requireFlag(args, "--current-plan", "high|low");
  if (currentPlanRaw !== "high" && currentPlanRaw !== "low") {
    console.error(`Error: --current-plan must be "high" or "low"`);
    process.exit(1);
  }

  const daysRaw = getFlag(args, "--days") ?? "30";
  const hiRateRaw = getFlag(args, "--hi-rate") ?? "0.35";
  const loRateRaw = getFlag(args, "--lo-rate") ?? "0.08";
  const billDate = getFlag(args, "--bill-date");

  const opts: AdvisorOptions = {
    currentPlan: currentPlanRaw,
    days: parseInt(daysRaw, 10),
    hiRate: parseFloat(hiRateRaw),
    loRate: parseFloat(loRateRaw),
    billDate,
  };

  const config = loadConfig();

  const endTime = new Date();
  endTime.setHours(0, 0, 0, 0); // start of today — exclude today (incomplete)

  const windowStart = new Date(endTime);
  windowStart.setDate(windowStart.getDate() - opts.days);

  // If bill date is earlier than the window start, fetch from there so the
  // backdate algorithm has the full bill period to scan.
  const fetchStart =
    billDate && new Date(billDate) < windowStart
      ? new Date(billDate)
      : windowStart;

  // Subtract 1ms so the stats API (which uses inclusive end_time) does not
  // return a partial period for the current day.
  const fetchEnd = new Date(endTime.getTime() - 1);

  const allDays = await fetchDailyStats(config, fetchStart, fetchEnd);

  if (allDays.length === 0) {
    console.error("No data returned from Home Assistant for the requested window.");
    process.exit(1);
  }

  const result = computeAdvisorResult(allDays, opts);
  console.log(formatResult(result, opts));
}

async function main(): Promise<void> {
  const { subcommand, args } = parseArgs(process.argv);

  if (subcommand === "advisor") {
    await runAdvisor(args);
  } else {
    console.error(`Unknown subcommand: "${subcommand}"`);
    console.error(
      "Usage: npm start -- advisor --current-plan <high|low> [--days <n>] [--bill-date <YYYY-MM-DD>]"
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
