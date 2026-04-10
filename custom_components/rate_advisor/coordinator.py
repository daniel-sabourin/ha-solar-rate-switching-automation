from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import statistics_during_period
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .const import CONF_DAYS, CONF_HI_RATE, CONF_LO_RATE, CONF_NET_SENSOR, DOMAIN

_LOGGER = logging.getLogger(__name__)


@dataclass
class AdvisorData:
    recommended_plan: str        # "high" or "low"
    optimal_date: str | None     # YYYY-MM-DD of the optimal switch date
    savings: float               # $ saved by being on recommended plan from optimal date
    window_net: float            # kWh net over the rolling window
    trend: str                   # "improving", "worsening", or "stable"
    energy_since_switch: float   # kWh net from optimal_date to end of window (signed)


def _find_optimal_backdate(
    days: list[dict[str, Any]], switch_to: str, rate_diff: float
) -> tuple[str | None, float, float]:
    """Find the start date that maximises cumulative net in the direction of switch_to.

    Scans backwards from the most recent day, accumulating sign * net.
    Returns (date, dollar_savings, raw_kwh_sum) for the start date that yields the
    highest sum. raw_kwh_sum is always positive (it is the directional optimum).
    Returns (None, 0.0, 0.0) if no beneficial starting point exists.
    """
    if not days:
        return None, 0.0, 0.0

    sign = 1.0 if switch_to == "high" else -1.0
    best_sum = 0.0
    best_date: str | None = None
    running_sum = 0.0

    for day in reversed(days):
        running_sum += sign * day["net"]
        if running_sum > best_sum:
            best_sum = running_sum
            best_date = day["date"]

    return best_date, best_sum * rate_diff, best_sum


def _compute_result(
    days: list[dict[str, Any]], hi_rate: float, lo_rate: float, window_size: int
) -> AdvisorData | None:
    """Compute the rate advisor result from a list of daily net production values."""
    window = days[-window_size:]
    if not window:
        return None

    rate_diff = hi_rate - lo_rate
    total_net = sum(d["net"] for d in window)

    # Use suffix-sum analysis for both directions. The plan with the higher potential
    # savings from its optimal start date is the recommendation.
    optimal_date_high, savings_high, raw_high = _find_optimal_backdate(window, "high", rate_diff)
    optimal_date_low, savings_low, raw_low = _find_optimal_backdate(window, "low", rate_diff)

    # Pick the plan whose optimal starting date is most recent — a later optimal date
    # means that plan is currently winning. This correctly handles windows where one plan
    # dominates historically but the other has become better in recent days.
    if optimal_date_high is None and optimal_date_low is None:
        recommended_plan = "low"
        optimal_date = None
        savings = 0.0
        energy_since_switch = 0.0
    elif optimal_date_high is None:
        recommended_plan = "low"
        optimal_date = optimal_date_low
        savings = savings_low
        energy_since_switch = -raw_low   # negative: net importer over this period
    elif optimal_date_low is None:
        recommended_plan = "high"
        optimal_date = optimal_date_high
        savings = savings_high
        energy_since_switch = raw_high   # positive: net exporter over this period
    elif optimal_date_high >= optimal_date_low:
        recommended_plan = "high"
        optimal_date = optimal_date_high
        savings = savings_high
        energy_since_switch = raw_high
    else:
        recommended_plan = "low"
        optimal_date = optimal_date_low
        savings = savings_low
        energy_since_switch = -raw_low

    # Trend: is net moving toward the recommended plan?
    mid = len(window) // 2
    prior_net = sum(d["net"] for d in window[:mid])
    recent_net = sum(d["net"] for d in window[mid:])

    if recommended_plan == "high":
        improving = recent_net > prior_net + 0.1
        worsening = recent_net < prior_net - 0.1
    else:
        improving = recent_net < prior_net - 0.1
        worsening = recent_net > prior_net + 0.1

    if improving:
        trend = "improving"
    elif worsening:
        trend = "worsening"
    else:
        trend = "stable"

    return AdvisorData(
        recommended_plan=recommended_plan,
        optimal_date=optimal_date,
        savings=round(savings, 2),
        window_net=round(total_net, 1),
        trend=trend,
        energy_since_switch=round(energy_since_switch, 1),
    )


class RateAdvisorCoordinator(DataUpdateCoordinator[AdvisorData]):
    """Fetches HA statistics and computes rate advisor results once per day."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(hours=24),
        )
        self.entry = entry
        self._net_sensor: str = entry.data[CONF_NET_SENSOR]
        self._hi_rate: float = float(entry.data[CONF_HI_RATE])
        self._lo_rate: float = float(entry.data[CONF_LO_RATE])
        self._days: int = int(entry.data[CONF_DAYS])
        self.window_days: list[dict[str, Any]] = []

    def format_diagnostics(self) -> str:
        """Format a full diagnostic report for display as a persistent notification."""
        data = self.data
        if not data or not self.window_days:
            return "No data available yet. Try reloading the integration."

        days = self.window_days
        window_start = days[0]["date"]
        window_end = days[-1]["date"]

        # Compute suffix sums ("from here" column)
        suffix: list[float] = [0.0] * len(days)
        running = 0.0
        for i in range(len(days) - 1, -1, -1):
            running += days[i]["net"]
            suffix[i] = running

        lines = [
            f"**Window:** {window_start} → {window_end} ({len(days)} days)",
            f"**Recommended:** {data.recommended_plan.upper()} from {data.optimal_date} (~${data.savings})",
            f"**Trend:** {data.trend}",
            f"**Window net:** {data.window_net:+.1f} kWh",
            f"**Energy since switch date:** {data.energy_since_switch:+.1f} kWh",
            "",
            "```",
            "Date          Net    From Here",
        ]
        for i, day in enumerate(days):
            net_str = f"{day['net']:+.1f}".rjust(8)
            cum_str = f"{suffix[i]:+.1f}".rjust(9)
            lines.append(f"{day['date']}  {net_str}  {cum_str}")
        lines.append("```")

        return "\n".join(lines)

    async def _async_update_data(self) -> AdvisorData:
        end_time = dt_util.now()
        start_time = end_time - timedelta(days=self._days + 2)  # +2 buffer for day boundaries

        try:
            stats: dict[str, list[dict[str, Any]]] = (
                await get_instance(self.hass).async_add_executor_job(
                    lambda: statistics_during_period(
                        self.hass,
                        start_time,
                        end_time,
                        {self._net_sensor},
                        "day",
                        None,
                        {"change"},
                    )
                )
            )
        except Exception as err:
            raise UpdateFailed(f"Failed to fetch statistics for {self._net_sensor}: {err}") from err

        raw = stats.get(self._net_sensor, [])
        if not raw:
            raise UpdateFailed(
                f"No statistics found for {self._net_sensor}. "
                "Ensure the sensor has state_class: total and is recorded by HA."
            )

        all_days: list[dict[str, Any]] = []
        for stat in raw:
            change = stat.get("change")
            if change is None:
                continue
            start_val = stat.get("start")
            if start_val is None:
                continue
            # start is a Unix timestamp (float) in HA 2023+
            if isinstance(start_val, (int, float)):
                dt = datetime.fromtimestamp(start_val, tz=timezone.utc)
            else:
                dt = start_val
            local_dt = dt_util.as_local(dt)
            all_days.append({"date": local_dt.strftime("%Y-%m-%d"), "net": change})

        all_days.sort(key=lambda x: x["date"])

        result = _compute_result(all_days, self._hi_rate, self._lo_rate, self._days)
        if result is None:
            raise UpdateFailed("Insufficient statistics data to compute a recommendation.")

        self.window_days = all_days[-self._days:]
        return result
