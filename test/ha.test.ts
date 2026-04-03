import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDailyStats } from "../src/ha.js";
import type { Config } from "../src/config.js";

const config: Config = {
  haUrl: "http://homeassistant.local:8123",
  haToken: "test-token",
  netSensor: "sensor.daily_net_production",
};

const startTime = new Date("2026-03-20T00:00:00.000Z");
const endTime = new Date("2026-03-22T00:00:00.000Z");

const mockResponse = {
  "sensor.daily_net_production": [
    { start: "2026-03-20T00:00:00+00:00", end: "2026-03-21T00:00:00+00:00", change: 11.8 },
    { start: "2026-03-21T00:00:00+00:00", end: "2026-03-22T00:00:00+00:00", change: -7.4 },
  ],
};

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
  it("calls HA API with correct parameters", async () => {
    await fetchDailyStats(config, startTime, endTime);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://homeassistant.local:8123/api/statistics_during_period");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");

    const body = JSON.parse(init.body);
    expect(body.statistic_ids).toEqual(["sensor.daily_net_production"]);
    expect(body.period).toBe("day");
    expect(body.types).toContain("change");
  });

  it("maps response to DailyStat array", async () => {
    const result = await fetchDailyStats(config, startTime, endTime);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: "2026-03-20", net: 11.8 });
    expect(result[1]).toEqual({ date: "2026-03-21", net: -7.4 });
  });

  it("returns empty array when sensor has no data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })
    );

    const result = await fetchDailyStats(config, startTime, endTime);
    expect(result).toEqual([]);
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      })
    );

    await expect(fetchDailyStats(config, startTime, endTime)).rejects.toThrow(
      "HA API error: 401 Unauthorized"
    );
  });
});
