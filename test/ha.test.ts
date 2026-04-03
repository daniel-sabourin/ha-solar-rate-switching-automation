import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDailyStats } from "../src/ha.js";
import type { Config } from "../src/config.js";

const config: Config = {
  haUrl: "http://homeassistant.local:8123",
  haToken: "test-token",
  netSensor: "sensor.daily_net_production",
};

// startTime / endTime aligned to UTC-6 local midnight (06:00 UTC)
const startTime = new Date("2026-03-20T06:00:00.000Z"); // local midnight March 20
const endTime = new Date("2026-03-22T06:00:00.000Z");   // local midnight March 22

// last_reset at 06:00 UTC → local midnight is UTC-6
const LAST_RESET = "2026-03-19T06:00:00+00:00";

function makePoint(stateVal: string, utcTime: string, includeAttributes = false) {
  return {
    state: stateVal,
    last_changed: utcTime,
    ...(includeAttributes ? { attributes: { last_reset: LAST_RESET } } : {}),
  };
}

// Two local days of readings. Each local day runs from 06:00 UTC to 05:59 UTC.
// March 20 local: last reading is 11.8 at 05:55 UTC March 21
// March 21 local: last reading is -7.4 at 05:55 UTC March 22
const mockResponse = [[
  // March 20 local (06:00 UTC March 20 → 05:59 UTC March 21)
  makePoint("0.0",  "2026-03-20T06:00:00+00:00", true), // reset, has attributes
  makePoint("5.2",  "2026-03-20T12:00:00+00:00"),
  makePoint("11.8", "2026-03-21T05:55:00+00:00"),        // last reading of March 20 local
  // March 21 local (06:00 UTC March 21 → 05:59 UTC March 22)
  makePoint("0.0",  "2026-03-21T06:00:00+00:00"),        // reset
  makePoint("-3.1", "2026-03-21T12:00:00+00:00"),
  makePoint("-7.4", "2026-03-22T05:55:00+00:00"),        // last reading of March 21 local
]];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    })
  );
});

describe("fetchDailyStats", () => {
  it("calls the history API with correct URL and auth", async () => {
    await fetchDailyStats(config, startTime, endTime);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/api/history/period/");
    expect(url).toContain("filter_entity_id=sensor.daily_net_production");
    expect(url).toContain(`end_time=${endTime.toISOString()}`);
    expect(init.headers.Authorization).toBe("Bearer test-token");
  });

  it("returns one DailyStat per local day with the last reading of that day", async () => {
    const result = await fetchDailyStats(config, startTime, endTime);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: "2026-03-20", net: 11.8 });
    expect(result[1]).toEqual({ date: "2026-03-21", net: -7.4 });
  });

  it("uses last_reset UTC hour to determine local date boundaries", async () => {
    // If last_reset is at 05:00 UTC (UTC-5 timezone), dates shift by one hour
    const utcMinus5Response = [[
      { state: "0.0", last_changed: "2026-03-20T05:00:00+00:00", attributes: { last_reset: "2026-03-19T05:00:00+00:00" } },
      makePoint("8.5",  "2026-03-21T04:55:00+00:00"),
    ]];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => utcMinus5Response }));

    const result = await fetchDailyStats(config, startTime, endTime);
    // 04:55 UTC March 21 = 23:55 local (UTC-5) March 20 → still March 20
    expect(result[0].date).toBe("2026-03-20");
    expect(result[0].net).toBe(8.5);
  });

  it("returns empty array when sensor has no history", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [[]] }));
    const result = await fetchDailyStats(config, startTime, endTime);
    expect(result).toEqual([]);
  });

  it("returns empty array when response is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const result = await fetchDailyStats(config, startTime, endTime);
    expect(result).toEqual([]);
  });

  it("throws when last_reset attribute is missing", async () => {
    const noResetResponse = [[
      { state: "5.0", last_changed: "2026-03-20T10:00:00+00:00" }, // no attributes
    ]];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => noResetResponse }));

    await expect(fetchDailyStats(config, startTime, endTime)).rejects.toThrow(
      "missing last_reset attribute"
    );
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }));
    await expect(fetchDailyStats(config, startTime, endTime)).rejects.toThrow("HA API error: 401 Unauthorized");
  });

  it("skips non-numeric state values", async () => {
    const withUnavailable = [[
      { state: "0.0", last_changed: "2026-03-20T06:00:00+00:00", attributes: { last_reset: LAST_RESET } },
      { state: "unavailable", last_changed: "2026-03-20T09:00:00+00:00" },
      { state: "5.0", last_changed: "2026-03-20T12:00:00+00:00" },
    ]];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => withUnavailable }));

    const result = await fetchDailyStats(config, startTime, endTime);
    expect(result[0].net).toBe(5.0);
  });
});
