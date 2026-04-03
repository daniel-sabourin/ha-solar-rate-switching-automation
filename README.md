# sense-automations

TypeScript CLI for Sense Home Energy Monitor via Home Assistant. Helps determine the optimal time to switch electricity rate plans based on rolling solar export/import data.

## Background

This tool is for a setup where:

- A **Sense Home Energy Monitor** feeds data into **Home Assistant**
- The electricity plan has two symmetrical rate tiers (import and export rates are always equal):
  - **High rate**: 35¢/kWh import and export
  - **Low rate**: 8¢/kWh import and export
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
HA_NET_SENSOR=sensor.daily_net_production   # adjust to your entity ID
```

The net sensor should be an entity that resets to 0 at midnight, increases as you export, and decreases as you import — i.e. daily net production (export − import). You can find your entity ID in Home Assistant under **Settings → Devices & Services → Entities** (search for your Sense integration).

The tool uses HA's WebSocket statistics API, so `HA_URL` should be the base URL of your HA instance (the WebSocket connection is derived automatically).

## Usage

```sh
npm start -- advisor --current-plan <high|low> [options]
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--current-plan` | *(required)* | Which plan you're currently on: `high` or `low` |
| `--days` | `30` | Trailing window in days (30 ≈ one billing cycle) |
| `--hi-rate` | `0.35` | High plan rate in $/kWh |
| `--lo-rate` | `0.08` | Low plan rate in $/kWh |
| `--bill-date` | *(none)* | Earliest date eligible for backdating (YYYY-MM-DD) |

### Example

```sh
npm start -- advisor --current-plan low --bill-date 2026-03-15
```

```
Rate Switch Advisor
===================
Window: 2026-03-04 → 2026-04-02  (30 days)
Current plan: LOW

  Net production:  -269.4 kWh (net importer)

Recommendation: STAY on LOW
  (imports must exceed exports to benefit from low rate)

Cost of being on wrong plan: ~$72.74 over this window
  (if you switched to HIGH, you'd pay 27c/kWh × 269.4 kWh more)

Trend (first half vs second half): net  -126.4 → -143.0 kWh  ↓ (worsening)

Daily breakdown:
  Date          Net     From here
  2026-03-04   -47.7    -269.4
  2026-03-05   +11.5    -221.7
  ...
  2026-04-02   -41.0     -41.0

Recommendation: STAY on LOW
```

The **Net** column is the day's net production (green = net exporter, red = net importer). The **From here** column shows the cumulative net from that day to the end of the window — this is what the backdate algorithm maximises when `--bill-date` is provided.

When a switch is recommended with `--bill-date` set, the output also includes:

```
Optimal backdate: 2026-03-18
  Savings vs switching today: ~$12.40
```

## Development

```sh
npm test            # run tests once
npm run test:watch  # watch mode
```

Tests use [vitest](https://vitest.dev/). The HA client tests mock the `WebSocket` class; the advisor logic tests are pure unit tests with no mocking needed.
