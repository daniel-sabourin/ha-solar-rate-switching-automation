# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project

**ha-rate-advisor** — Home Assistant custom integration (HACS) that analyses net solar energy production to recommend when to switch electricity rate plans. Reads daily statistics directly from the HA recorder. Tested with a Sense Home Energy Monitor but works with any HA energy sensor that tracks daily net production.

## Repository

- GitHub: `daniel-sabourin/ha-solar-rate-switching-automation`
- Branch: `main`

## Background: The Rate-Switching Problem

The user has solar panels and a net energy production sensor in Home Assistant. Their electricity plan has two modes — both the import and export rate are always tied together (symmetrical):

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

The actual rate values don't affect the *decision*, only the *dollar impact* of being on the wrong plan:

```
cost_of_wrong_plan = |exports - imports| × (0.35 - 0.08)
```

## Architecture

All integration code lives in `custom_components/rate_advisor/`:

- `__init__.py` — integration setup/teardown, midnight refresh trigger, `rate_advisor.diagnose` service
- `coordinator.py` — fetches HA recorder statistics, runs advisor logic, exposes `format_diagnostics()`
- `sensor.py` — six sensor entity definitions
- `config_flow.py` — UI configuration wizard
- `const.py` — constants and defaults
- `manifest.json` — HACS/HA integration metadata
- `services.yaml` — service descriptions for Developer Tools UI
- `strings.json` / `translations/en.json` — config flow UI strings

## Key Details

### Data Source

Uses `homeassistant.components.recorder.statistics.statistics_during_period` called via `async_add_executor_job`. Fetches `change` values for the net sensor over a `day` period. No external HTTP calls — reads directly from the HA recorder database.

### Recommendation Algorithm

Uses suffix-sum analysis on the rolling window. Scans backwards from the most recent day to find the optimal starting date for each plan direction (high/low). Recommends the plan whose optimal starting date is most recent — a later date signals that plan is currently winning. This correctly handles spring/fall transitions where the full window net still favours the old plan but recent days have flipped.

### Sensors

| Entity | Type | Notes |
|---|---|---|
| `sensor.rate_advisor_recommended_plan` | `str` | `"high"` or `"low"` |
| `sensor.rate_advisor_optimal_switch_date` | `str` | YYYY-MM-DD |
| `sensor.rate_advisor_savings` | `float` ($) | Dollar benefit from optimal date |
| `sensor.rate_advisor_energy_since_switch_date` | `float` (kWh) | Signed net kWh from optimal date to window end |
| `sensor.rate_advisor_window_net` | `float` (kWh) | Total net over rolling window |
| `sensor.rate_advisor_trend` | `str` | `"improving"`, `"worsening"`, or `"stable"` |

### Refresh Schedule

Refreshes at 00:05 daily via `async_track_time_change` (after midnight statistics finalise). Falls back to a 24-hour interval from last update.

### Diagnose Service

`rate_advisor.diagnose` creates a persistent HA notification with the full daily breakdown table including Net and From Here (suffix sum) columns — equivalent to what the old CLI printed. Call it from Developer Tools → Services.
