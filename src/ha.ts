import type { Config } from "./config.js";
import type { DailyStat } from "./types.js";

interface HaStatPoint {
  start: string;
  end: string;
  change: number;
}

type HaStatResponse = Record<string, HaStatPoint[]>;

export async function fetchDailyStats(
  config: Config,
  startTime: Date,
  endTime: Date
): Promise<DailyStat[]> {
  const body = {
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    statistic_ids: [config.netSensor],
    period: "day",
    types: ["change"],
  };

  const response = await fetch(`${config.haUrl}/api/statistics_during_period`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.haToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HA API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as HaStatResponse;
  const points = data[config.netSensor] ?? [];

  return points.map((pt) => ({
    date: pt.start.slice(0, 10),
    net: pt.change,
  }));
}
