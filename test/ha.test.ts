import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDailyStats } from "../src/ha.js";
import type { Config } from "../src/config.js";

const config: Config = {
  haUrl: "http://homeassistant.local:8123",
  haToken: "test-token",
  importSensor: "sensor.energy_import",
  exportSensor: "sensor.energy_export",
};

const startTime = new Date("2026-03-20T00:00:00.000Z");
const endTime = new Date("2026-03-22T00:00:00.000Z");

const mockResponse = {
  "sensor.energy_import": [
    { start: "2026-03-20T00:00:00+00:00", end: "2026-03-21T00:00:00+00:00", change: 24.1 },
    { start: "2026-03-21T00:00:00+00:00", end: "2026-03-22T00:00:00+00:00", change: 22.8 },
  ],
  "sensor.energy_export": [
    { start: "2026-03-20T00:00:00+00:00", end: "2026-03-21T00:00:00+00:00", change: 12.3 },
    { start: "2026-03-21T00:00:00+00:00", end: "2026-03-22T00:00:00+00:00", change: 15.4 },
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
    expect(body.statistic_ids).toContain("sensor.energy_import");
    expect(body.statistic_ids).toContain("sensor.energy_export");
    expect(body.period).toBe("day");
    expect(body.types).toContain("change");
  });

  it("maps response to DailyStat array", async () => {
    const result = await fetchDailyStats(config, startTime, endTime);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: "2026-03-20", import: 24.1, export: 12.3 });
    expect(result[1]).toEqual({ date: "2026-03-21", import: 22.8, export: 15.4 });
  });

  it("fills missing export days with 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          "sensor.energy_import": [
            { start: "2026-03-20T00:00:00+00:00", end: "2026-03-21T00:00:00+00:00", change: 10 },
          ],
          "sensor.energy_export": [],
        }),
      })
    );

    const result = await fetchDailyStats(config, startTime, endTime);
    expect(result[0].export).toBe(0);
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
