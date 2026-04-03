import type { Config } from "./config.js";
import type { DailyStat } from "./types.js";

interface HaHistoryPoint {
  state: string;
  last_changed: string;
  attributes?: {
    last_reset?: string;
    [key: string]: unknown;
  };
}

/**
 * Fetches daily net production stats from HA's history API.
 *
 * The sensor (state_class: total) resets to 0 at local midnight. Its value at
 * any point is the running net since the last reset (positive = net exporter).
 * The end-of-day net production is therefore the last reading before the next
 * midnight reset. We derive the local midnight UTC hour from the last_reset
 * attribute of the first history point, then group all readings by local date
 * and keep the last value per day.
 */
export async function fetchDailyStats(
  config: Config,
  startTime: Date,
  endTime: Date
): Promise<DailyStat[]> {
  const url =
    `${config.haUrl}/api/history/period/${startTime.toISOString()}` +
    `?end_time=${endTime.toISOString()}&filter_entity_id=${encodeURIComponent(config.netSensor)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.haToken}` },
  });

  if (!response.ok) {
    throw new Error(`HA API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Array<HaHistoryPoint[]>;
  const points = data[0] ?? [];
  if (points.length === 0) return [];

  // The first point carries the last_reset attribute — its UTC hour is the
  // UTC equivalent of local midnight (e.g. 06:00 UTC for a UTC-6 timezone).
  const lastResetStr = points[0].attributes?.last_reset;
  if (!lastResetStr) {
    throw new Error(
      "Sensor is missing last_reset attribute — " +
        "ensure it is configured with state_class: total and last_reset tracking in Home Assistant"
    );
  }
  const midnightUTCHour = new Date(lastResetStr).getUTCHours();

  // Group readings by local date, keeping the last (most recent) value per day.
  // Points arrive in chronological order, so later assignments overwrite earlier ones.
  const byDate = new Map<string, number>();
  for (const pt of points) {
    const value = parseFloat(pt.state);
    if (isNaN(value)) continue;
    const localDate = utcToLocalDate(new Date(pt.last_changed), midnightUTCHour);
    byDate.set(localDate, value);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, net]) => ({ date, net }));
}

function utcToLocalDate(utc: Date, midnightUTCHour: number): string {
  const localMs = utc.getTime() - midnightUTCHour * 3_600_000;
  return new Date(localMs).toISOString().slice(0, 10);
}
