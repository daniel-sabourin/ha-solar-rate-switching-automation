import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchDailyStats } from "../src/ha.js";
import type { Config } from "../src/config.js";

const config: Config = {
  haUrl: "http://homeassistant.local:8123",
  haToken: "test-token",
  netSensor: "sensor.daily_net_production",
};

const startTime = new Date("2026-03-20T06:00:00.000Z");
const endTime = new Date("2026-04-03T06:00:00.000Z");

// --- WebSocket mock ---

let mockResultMessages: object[] = [];
let lastWsUrl = "";
let lastWsSendCalls: string[] = [];

class MockWebSocket {
  private listeners: Record<string, ((e: object) => void)[]> = {};

  constructor(url: string) {
    lastWsUrl = url;
    lastWsSendCalls = [];
    // Defer so addEventListener calls happen first
    queueMicrotask(() => this.emit("message", { data: JSON.stringify({ type: "auth_required" }) }));
  }

  addEventListener(event: string, fn: (e: object) => void) {
    this.listeners[event] ??= [];
    this.listeners[event].push(fn);
  }

  send(data: string) {
    lastWsSendCalls.push(data);
    const msg = JSON.parse(data) as { type: string };

    if (msg.type === "auth") {
      this.emit("message", { data: JSON.stringify({ type: "auth_ok" }) });
      return;
    }

    for (const m of mockResultMessages) {
      this.emit("message", { data: JSON.stringify(m) });
    }
  }

  close() {}

  private emit(event: string, payload: object) {
    for (const fn of this.listeners[event] ?? []) fn(payload);
  }
}

beforeEach(() => {
  mockResultMessages = [
    {
      id: 1,
      type: "result",
      success: true,
      result: {
        "sensor.daily_net_production": [
          { start: "2026-03-20T06:00:00+00:00", end: "2026-03-21T06:00:00+00:00", change: 11.8 },
          { start: "2026-03-21T06:00:00+00:00", end: "2026-03-22T06:00:00+00:00", change: -7.2 },
        ],
      },
    },
  ];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchDailyStats", () => {
  it("connects to the WebSocket API with the correct URL", async () => {
    await fetchDailyStats(config, startTime, endTime);
    expect(lastWsUrl).toBe("ws://homeassistant.local:8123/api/websocket");
  });

  it("uses wss:// when haUrl starts with https://", async () => {
    const httpsConfig = { ...config, haUrl: "https://homeassistant.local" };
    await fetchDailyStats(httpsConfig, startTime, endTime);
    expect(lastWsUrl).toBe("wss://homeassistant.local/api/websocket");
  });

  it("sends auth token after auth_required", async () => {
    await fetchDailyStats(config, startTime, endTime);
    const authMsg = lastWsSendCalls.map((d) => JSON.parse(d) as { type: string }).find((m) => m.type === "auth");
    expect(authMsg).toMatchObject({ type: "auth", access_token: "test-token" });
  });

  it("sends statistics command with correct parameters", async () => {
    await fetchDailyStats(config, startTime, endTime);
    const statsMsg = lastWsSendCalls
      .map((d) => JSON.parse(d) as { type: string })
      .find((m) => m.type === "recorder/statistics_during_period");
    expect(statsMsg).toMatchObject({
      statistic_ids: ["sensor.daily_net_production"],
      period: "day",
      types: ["change"],
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    });
  });

  it("maps result to DailyStat array with correct dates and net values", async () => {
    const result = await fetchDailyStats(config, startTime, endTime);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: "2026-03-20", net: 11.8 });
    expect(result[1]).toEqual({ date: "2026-03-21", net: -7.2 });
  });

  it("derives local date from timestamps with UTC offset", async () => {
    // UTC+5:30 (IST): local midnight = 18:30 UTC of the previous day
    mockResultMessages = [{
      id: 1, type: "result", success: true,
      result: {
        "sensor.daily_net_production": [
          { start: "2026-03-30T18:30:00+05:30", end: "2026-03-31T18:30:00+05:30", change: 5.5 },
        ],
      },
    }];
    const result = await fetchDailyStats(config, startTime, endTime);
    // +05:30 offset: local midnight = 18:30 UTC March 30 → local date is March 30
    expect(result[0].date).toBe("2026-03-30");
  });

  it("returns empty array when sensor has no data", async () => {
    mockResultMessages = [{ id: 1, type: "result", success: true, result: {} }];
    const result = await fetchDailyStats(config, startTime, endTime);
    expect(result).toEqual([]);
  });

  it("rejects on auth failure", async () => {
    class AuthFailWs extends MockWebSocket {
      send(data: string) {
        const msg = JSON.parse(data) as { type: string };
        if (msg.type === "auth") {
          // @ts-expect-error accessing private emit via any
          (this as unknown as { emit: (e: string, p: object) => void }).emit(
            "message",
            { data: JSON.stringify({ type: "auth_invalid" }) }
          );
        }
      }
    }
    vi.stubGlobal("WebSocket", AuthFailWs);
    await expect(fetchDailyStats(config, startTime, endTime)).rejects.toThrow(
      "HA authentication failed"
    );
  });

  it("rejects when HA returns an error result", async () => {
    mockResultMessages = [{
      id: 1, type: "result", success: false,
      error: { message: "Unknown statistic" },
    }];
    await expect(fetchDailyStats(config, startTime, endTime)).rejects.toThrow(
      "Unknown statistic"
    );
  });
});
