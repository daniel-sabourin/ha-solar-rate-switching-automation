# ha-solar-rate-switching-automation

TypeScript CLI for determining the optimal time to switch electricity rate plans, using net energy production data from Home Assistant. Tested with a Sense Home Energy Monitor, but works with any HA energy sensor that tracks daily net production.

## Background

This tool is for a setup where:

- A **Home Assistant** instance tracks daily net energy production (e.g. via a Sense Home Energy Monitor or any other energy monitor integration)
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

The net sensor must be a HA entity with `state_class: total` that resets to 0 at midnight, increases as you export, and decreases as you import — i.e. daily net production (export − import). You can find your entity ID in Home Assistant under **Settings → Devices & Services → Entities**.

The tool connects via HA's WebSocket statistics API, so `HA_URL` should be the base HTTP URL of your HA instance (the WebSocket URL is derived automatically).

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
| `--earliest-switch-date` | *(none)* | Earliest date you can switch rates (YYYY-MM-DD). Bounds both the window and the backdate scan — data before this date is excluded. |

### Example

```sh
npm start -- advisor --current-plan low --earliest-switch-date 2026-03-15
```

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

The **Net** column is the day's net production (green = net exporter, red = net importer). The **From here** column shows the cumulative net from that day to the end of the window — this is what drives both the recommendation and the optimal switch date. Even if the full window net is negative (still a net importer overall), a positive "From here" suffix means switching now would be beneficial, and the tool recommends accordingly.

When `--earliest-switch-date` is set and a switch is recommended, the output also includes an optimal backdate scanned across the full billing period:

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
