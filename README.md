# ha-solar-rate-switching-automation

Home Assistant custom integration for determining the optimal time to switch electricity rate plans, using net energy production data from Home Assistant. Tested with a Sense Home Energy Monitor, but works with any HA energy sensor that tracks daily net production.

## Background

This integration is for a setup where:

- A **Home Assistant** instance tracks daily net energy production (e.g. via a Sense Home Energy Monitor or any other energy monitor integration)
- The electricity plan has two symmetrical rate tiers (import and export rates are always equal):
  - **High rate**: 35¢/kWh import and export
  - **Low rate**: 8¢/kWh import and export
- The plan is switched manually twice a year (spring → high, fall → low)

Because import and export rates are always equal, the break-even is simply **exports = imports**. The high rate is better whenever exports exceed imports, and vice versa.

## Installation

### 1. Add via HACS

In HACS → Integrations → ⋮ → Custom repositories, add:

```
https://github.com/daniel-sabourin/ha-solar-rate-switching-automation
```

Select **Integration** as the category, then install **Rate Advisor** and restart Home Assistant.

### 2. Configure

Settings → Integrations → Add Integration → search **Rate Advisor**.

| Setting | Default | Description |
|---|---|---|
| Net production sensor | `sensor.daily_net_production` | HA entity ID for your net energy sensor |
| High rate ($/kWh) | `0.35` | High plan rate |
| Low rate ($/kWh) | `0.08` | Low plan rate |
| Rolling window (days) | `30` | How many days of history to analyse |

The net sensor must have `state_class: total`, reset to 0 at midnight, increase on export, and decrease on import (daily net production = export − import).

## Sensors

All sensors are grouped under a single **Rate Advisor** device.

| Entity | Example | Description |
|---|---|---|
| `sensor.rate_advisor_recommended_plan` | `high` | Which plan is currently optimal |
| `sensor.rate_advisor_optimal_switch_date` | `2026-04-09` | Best date to have switched from |
| `sensor.rate_advisor_savings` | `8.96` ($) | Dollar benefit of being on the recommended plan from the optimal date |
| `sensor.rate_advisor_energy_since_switch_date` | `+33.2` (kWh) | Net kWh since the optimal switch date (positive = net exporter, negative = net importer) |
| `sensor.rate_advisor_window_net` | `-205.5` (kWh) | Net kWh over the full rolling window |
| `sensor.rate_advisor_trend` | `improving` | Whether the net is moving toward the recommended plan (`improving`, `worsening`, `stable`) |

Sensors update once per day at 00:05 (after midnight statistics finalise). The device card also exposes two buttons:

| Button | Description |
|---|---|
| **Refresh** | Trigger an immediate data fetch and recompute |
| **Run Diagnostics** | Create a persistent notification with the full daily breakdown |

You can also force a refresh via Settings → Integrations → Rate Advisor → ⋮ → Reload.

## How the recommendation works

The integration uses suffix-sum analysis on the rolling window rather than the simple window total. Even if the full 30-day net is negative (net importer overall), a positive "from here" value at the end of the window means exports have recently started winning — and the integration recommends switching to the high rate accordingly.

The recommendation is determined by comparing the **cumulative kWh signal** of each plan from its optimal starting date. Whichever plan has accumulated the stronger net energy advantage (in its favoured direction) wins. This prevents a single bad solar day from overriding a sustained trend in the opposite direction.

## Push notifications

Create an automation to send a push notification when the recommendation changes:

```yaml
trigger:
  - platform: state
    entity_id: sensor.rate_advisor_recommended_plan
action:
  - service: notify.mobile_app_<your_phone>
    data:
      title: "Rate Switch Advisor"
      message: >
        Recommendation: {{ states('sensor.rate_advisor_recommended_plan') | upper }}
        from {{ states('sensor.rate_advisor_optimal_switch_date') }},
        saves ${{ states('sensor.rate_advisor_savings') }}
```

## Diagnostics

Press the **Run Diagnostics** button on the Rate Advisor device card, or call the **Rate Advisor: Diagnose** service from Developer Tools → Services. Either way, a persistent notification appears with the full daily breakdown:

```
Window: 2026-03-11 → 2026-04-09 (30 days)
Recommended: HIGH from 2026-04-09 (~$8.96)
Trend: improving
Window net: -205.5 kWh
Energy since switch date: +33.2 kWh

Date          Net    From Here
2026-03-11   -32.7    -205.5
2026-03-12   -12.3    -172.8
...
2026-04-09   +33.2     +33.2
```

The **From Here** column shows the cumulative net from each day to the end of the window — this is what the recommendation algorithm maximises.
