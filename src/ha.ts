import type { Config } from "./config.js";
import type { DailyStat } from "./types.js";

interface HaStatPoint {
  start: string | number; // ISO string or Unix timestamp (seconds)
  end: string | number;
  change: number;
}

type HaStatResult = Record<string, HaStatPoint[]>;

interface HaWsMessage {
  type: string;
  id?: number;
  success?: boolean;
  result?: HaStatResult;
  error?: { message: string };
}

function toWsUrl(haUrl: string): string {
  return haUrl.replace(/^http/, "ws") + "/api/websocket";
}

/**
 * Fetches daily net production stats via HA's WebSocket statistics API
 * (recorder/statistics_during_period). This gives exact daily totals as
 * computed by HA's recorder.
 */
export async function fetchDailyStats(
  config: Config,
  startTime: Date,
  endTime: Date
): Promise<DailyStat[]> {
  const wsUrl = toWsUrl(config.haUrl);

  return new Promise<DailyStat[]>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);

    ws.addEventListener("error", () => {
      reject(new Error(`Could not connect to Home Assistant at ${wsUrl}`));
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
      let msg: HaWsMessage;
      try {
        msg = JSON.parse(event.data) as HaWsMessage;
      } catch {
        reject(new Error("Unexpected non-JSON message from HA WebSocket"));
        ws.close();
        return;
      }

      switch (msg.type) {
        case "auth_required":
          ws.send(JSON.stringify({ type: "auth", access_token: config.haToken }));
          break;

        case "auth_invalid":
          ws.close();
          reject(new Error("HA authentication failed — check HA_TOKEN"));
          break;

        case "auth_ok":
          ws.send(
            JSON.stringify({
              id: 1,
              type: "recorder/statistics_during_period",
              start_time: startTime.toISOString(),
              end_time: endTime.toISOString(),
              statistic_ids: [config.netSensor],
              period: "day",
              types: ["change"],
            })
          );
          break;

        case "result":
          ws.close();
          if (!msg.success) {
            reject(
              new Error(`HA statistics error: ${msg.error?.message ?? "unknown"}`)
            );
            return;
          }
          const points = (msg.result ?? {})[config.netSensor] ?? [];
          resolve(
            points.map((pt) => ({
              date: localDateFromStatStart(pt.start),
              net: pt.change,
            }))
          );
          break;
      }
    });
  });
}

/**
 * Extracts the local calendar date from a statistics period start value.
 * HA's WebSocket API returns start as a Unix timestamp (seconds). The period
 * starts at local midnight, so converting to a Date and slicing the UTC date
 * gives the correct local date for UTC and UTC-X timezones. For UTC+X, we
 * apply the offset parsed from an ISO string if HA ever returns one instead.
 */
function localDateFromStatStart(start: string | number): string {
  // Numeric: Unix timestamp in milliseconds
  if (typeof start === "number") {
    return new Date(start).toISOString().slice(0, 10);
  }
  // ISO string with explicit offset (e.g. "2026-03-31T06:00:00+00:00")
  const offsetMatch = start.match(/([+-])(\d{2}):(\d{2})$/);
  if (offsetMatch) {
    const sign = offsetMatch[1] === "+" ? 1 : -1;
    const offsetMs =
      sign * (parseInt(offsetMatch[2], 10) * 60 + parseInt(offsetMatch[3], 10)) * 60_000;
    const localMs = new Date(start).getTime() + offsetMs;
    return new Date(localMs).toISOString().slice(0, 10);
  }
  return new Date(start).toISOString().slice(0, 10);
}
