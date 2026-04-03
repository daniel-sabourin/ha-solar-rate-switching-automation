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
    statistic_ids: [config.importSensor, config.exportSensor],
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

  const importPoints = data[config.importSensor] ?? [];
  const exportPoints = data[config.exportSensor] ?? [];

  // Index export by date string for fast lookup
  const exportByDate = new Map<string, number>();
  for (const pt of exportPoints) {
    const date = pt.start.slice(0, 10);
    exportByDate.set(date, pt.change);
  }

  return importPoints.map((pt) => {
    const date = pt.start.slice(0, 10);
    return {
      date,
      import: pt.change,
      export: exportByDate.get(date) ?? 0,
    };
  });
}
