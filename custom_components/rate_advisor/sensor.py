from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import AdvisorData, RateAdvisorCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: RateAdvisorCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([
        RecommendedPlanSensor(coordinator, entry),
        OptimalSwitchDateSensor(coordinator, entry),
        SavingsSensor(coordinator, entry),
        WindowNetSensor(coordinator, entry),
        TrendSensor(coordinator, entry),
    ])


class _BaseSensor(CoordinatorEntity[RateAdvisorCoordinator], SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator: RateAdvisorCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._entry = entry

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "Rate Advisor",
            "manufacturer": "ha-solar-rate-switching-automation",
        }

    @property
    def _data(self) -> AdvisorData | None:
        return self.coordinator.data


class RecommendedPlanSensor(_BaseSensor):
    _attr_name = "Recommended Plan"
    _attr_icon = "mdi:lightning-bolt"

    @property
    def unique_id(self) -> str:
        return f"{self._entry.entry_id}_recommended_plan"

    @property
    def native_value(self) -> str | None:
        return self._data.recommended_plan if self._data else None


class OptimalSwitchDateSensor(_BaseSensor):
    _attr_name = "Optimal Switch Date"
    _attr_icon = "mdi:calendar-check"

    @property
    def unique_id(self) -> str:
        return f"{self._entry.entry_id}_optimal_switch_date"

    @property
    def native_value(self) -> str | None:
        return self._data.optimal_date if self._data else None


class SavingsSensor(_BaseSensor):
    _attr_name = "Savings"
    _attr_native_unit_of_measurement = "$"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:cash"

    @property
    def unique_id(self) -> str:
        return f"{self._entry.entry_id}_savings"

    @property
    def native_value(self) -> float | None:
        return self._data.savings if self._data else None


class WindowNetSensor(_BaseSensor):
    _attr_name = "Window Net"
    _attr_native_unit_of_measurement = "kWh"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:solar-power"

    @property
    def unique_id(self) -> str:
        return f"{self._entry.entry_id}_window_net"

    @property
    def native_value(self) -> float | None:
        return self._data.window_net if self._data else None


class TrendSensor(_BaseSensor):
    _attr_name = "Trend"
    _attr_icon = "mdi:trending-up"

    @property
    def unique_id(self) -> str:
        return f"{self._entry.entry_id}_trend"

    @property
    def native_value(self) -> str | None:
        return self._data.trend if self._data else None
