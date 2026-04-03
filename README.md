# sense-automations

TypeScript CLI for Sense Home Energy Monitor via Home Assistant. Helps determine the optimal time to switch electricity rate plans based on rolling solar export/import data.

## Background

This tool is for a setup where:

- A **Sense Home Energy Monitor** feeds data into **Home Assistant**
- The electricity plan has two symmetrical rate tiers (import and export rates are always equal):
  - **High rate**: 35¢/kWh import and export
  - **Low rate**: 10¢/kWh import and export
- The plan is switched manually twice a year (spring → high, fall → low)

Because import and export rates are always equal, the break-even is simply **exports = imports**. The high rate is better whenever exports exceed imports, and vice versa.

## Setup

### 1. Install dependencies

```sh
npm install
```

### 2. Configure environment variables

Create a `.env` file or export these in your shell:

```sh
HA_URL=http://homeassistant.local:8123
HA_TOKEN=your_long_lived_access_token
HA_IMPORT_SENSOR=sensor.sense_daily_grid_usage   # adjust to your entity ID
HA_EXPORT_SENSOR=sensor.sense_daily_grid_exported
```

You can find your entity IDs in Home Assistant under **Settings → Devices & Services → Entities** (search for your Sense integration).

## Usage

```sh
npm start -- advisor --current-plan <high|low> [options]
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--current-plan` | *(required)* | Which plan you're currently on: `high` or `low` |
| `--days` | `14` | Trailing window in days |
| `--hi-rate` | `0.35` | High plan rate in $/kWh |
| `--lo-rate` | `0.10` | Low plan rate in $/kWh |

### Example

```sh
npm start -- advisor --current-plan low --days 14
```

```
Rate Switch Advisor
===================
Window: 2026-03-20 → 2026-04-03  (14 days)
Current plan: LOW

  Imported:  312.4 kWh
  Exported:  189.7 kWh
  Net:       122.7 kWh (net importer)

Recommendation: STAY on LOW
  (imports must exceed exports to benefit from low rate)

Cost of being on wrong plan: ~$30.68 over this window
  (if you switched to HIGH, you'd pay 25c/kWh × 122.7 kWh more)

Trend (last 7d vs prior 7d): E/I ratio  0.55 → 0.66  ↑ (improving)

Daily breakdown:
  Date        Import   Export   Net
  2026-03-20    24.1     12.3  -11.8
  ...
```

## Development

```sh
npm test          # run tests once
npm run test:watch  # watch mode
```

Tests use [vitest](https://vitest.dev/). The HA client tests mock `fetch`; the advisor logic tests are pure unit tests with no mocking needed.
