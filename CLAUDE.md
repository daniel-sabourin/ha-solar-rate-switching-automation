# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project

**ha-rate-advisor** — TypeScript CLI that queries Home Assistant's WebSocket statistics API to help determine the optimal time to switch electricity rate plans. Tested with a Sense Home Energy Monitor but works with any HA energy sensor that tracks daily net production.

## Repository

- GitHub: `daniel-sabourin/ha-solar-rate-switching-automation`
- Branch: `main`

## Commands

- `npm start -- advisor [options]` — run the rate advisor
- `npm test` — run tests (vitest)
- `npm run test:watch` — run tests in watch mode

## Background: The Rate-Switching Problem

The user has solar panels and a net energy production sensor in Home Assistant (tested with a Sense Home Energy Monitor). Their electricity plan has two modes — both the import and export rate are always tied together (symmetrical):

- **High rate**: 35c/kWh for both imports AND exports
- **Low rate**: 8c/kWh for both imports AND exports

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
cost_of_wrong_plan = |exports - imports| × (0.35 - 0.08)
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

Entity IDs vary by installation and energy monitor — configured via env var (`HA_NET_SENSOR`).

### Rolling Window

- Default: **30 days** (matches a typical billing cycle)
- Configurable via `--days` flag
- Also show trend: last 7d vs prior 7d within the window

### CLI Interface

```
npm start -- advisor [options]

Options:
  --current-plan <high|low>   Which plan you're currently on (required)
  --days <n>                  Trailing window in days (default: 30)
  --hi-rate <rate>            High plan rate in $/kWh (default: 0.35)
  --lo-rate <rate>            Low plan rate in $/kWh (default: 0.08)
```

### Output Format

```
Rate Switch Advisor
===================
Window: 2026-03-11 → 2026-04-09  (30 days)
Current plan: LOW

  Net production:  -205.5 kWh (net importer)

Recommendation: SWITCH to HIGH

Savings from switching to HIGH (from 2026-04-09): ~$8.96

Trend (first half vs second half): net  -103.8 → -101.7 kWh  ↑ (improving)

Daily breakdown:
  Date          Net     From here
  2026-03-11   -32.7    -205.5
  2026-03-12   -12.3    -172.8
  ...
  2026-04-09   +33.2     +33.2

Recommendation: SWITCH to HIGH (from 2026-04-09)
```

When STAY is recommended:
```
Recommendation: STAY on LOW
  (imports must exceed exports to benefit from low rate)

Cost of being on wrong plan: ~$55.49 over this window
  (if you switched to HIGH, you'd pay 27c/kWh × 205.5 kWh more)
```

### Testing

Uses vitest. Follow the same pattern as `solar-automations`:
- Mock `fetch` with `vi.stubGlobal` for HA client tests
- Pure unit tests for advisor logic (no mocking needed — takes data directly)
- Use `vi.hoisted()` for mock variables inside `vi.mock()` factories
