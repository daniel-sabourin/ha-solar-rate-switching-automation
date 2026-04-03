# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project

**sense-automations** — TypeScript CLI that queries Home Assistant's statistics API (which aggregates Sense Home Energy Monitor data) to help determine the optimal time to switch electricity rate plans.

## Repository

- GitHub: `daniel-sabourin/sense-automations`
- Branch: `main`

## Commands

- `npm start -- advisor [options]` — run the rate advisor
- `npm test` — run tests (vitest)
- `npm run test:watch` — run tests in watch mode

## Background: The Rate-Switching Problem

The user has solar panels and a Sense Home Energy Monitor integrated into Home Assistant. Their electricity plan has two modes — both the import and export rate are always tied together (symmetrical):

- **High rate**: 35c/kWh for both imports AND exports
- **Low rate**: 10c/kWh for both imports AND exports

They manually switch rates twice a year:
- **Spring → high rate**: when solar exports are consistently exceeding grid consumption
- **Fall → low rate**: when grid consumption is consistently exceeding exports

## The Math

Because import and export rates are always equal to each other on any given plan, the break-even is exactly **exports = imports**:

- Net cost on any rate R = `R × (imports - exports)`
- High rate is cheaper when `(imports - exports) < 0`, i.e. exports > imports
- Low rate is cheaper when `(imports - exports) > 0`, i.e. imports > exports

The actual rate values (35c vs 10c) don't affect the *decision*, only the *dollar impact* of being on the wrong plan:

```
cost_of_wrong_plan = |exports - imports| × (0.35 - 0.10)
```

## Architecture

- `src/index.ts` — CLI entry point, dispatches sub-commands
- `src/ha.ts` — Home Assistant statistics API client
- `src/rateAdvisor.ts` — rolling window computation, recommendation logic, output formatting
- `src/config.ts` — loads environment variables
- `src/types.ts` — shared interfaces

## Key Details

### Data Source: Home Assistant Statistics API

```
POST /api/statistics_during_period
Authorization: Bearer <HA_TOKEN>
Content-Type: application/json

{
  "start_time": "<ISO8601>",
  "end_time": "<ISO8601>",
  "statistic_ids": ["<HA_IMPORT_SENSOR>", "<HA_EXPORT_SENSOR>"],
  "period": "day",
  "types": ["change"]
}
```

Response: `Record<sensor_id, Array<{ start: string, end: string, change: number }>>` — daily delta kWh values.

Sense entity IDs vary by installation — they are configured via env vars (`HA_IMPORT_SENSOR`, `HA_EXPORT_SENSOR`).

### Rolling Window

- Default: **14 days** (two full week cycles — removes weekday/weekend consumption bias)
- Configurable via `--days` flag
- Also show trend: last 7d vs prior 7d within the window

### CLI Interface

```
npm start -- advisor [options]

Options:
  --current-plan <high|low>   Which plan you're currently on (required)
  --days <n>                  Trailing window in days (default: 14)
  --hi-rate <rate>            High plan rate in $/kWh (default: 0.35)
  --lo-rate <rate>            Low plan rate in $/kWh (default: 0.10)
```

### Output Format

```
Rate Switch Advisor
===================
Window: 2026-03-20 → 2026-04-03  (14 days)
Current plan: LOW

  Imported:  312.4 kWh
  Exported:  189.7 kWh
  Net:       -122.7 kWh (net importer)

Recommendation: STAY on LOW
  (exports must exceed imports to benefit from high rate)

Cost of being on wrong plan: ~$30.68 over this window
  (if you switched to HIGH, you'd pay 25c/kWh × 122.7 kWh more)

Trend (last 7d vs prior 7d): E/I ratio  0.55 → 0.66  ↑ (improving)

Daily breakdown:
  Date        Import   Export   Net
  2026-03-20  24.1     12.3    -11.8
  2026-03-21  22.8     15.4    -7.4
  ...
```

### Testing

Uses vitest. Follow the same pattern as `solar-automations`:
- Mock `fetch` with `vi.stubGlobal` for HA client tests
- Pure unit tests for advisor logic (no mocking needed — takes data directly)
- Use `vi.hoisted()` for mock variables inside `vi.mock()` factories
