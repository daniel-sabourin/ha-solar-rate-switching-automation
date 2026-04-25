from __future__ import annotations

from homeassistant.components import persistent_notification
from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import RateAdvisorCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: RateAdvisorCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([
        RateAdvisorRefreshButton(coordinator, entry),
        RateAdvisorDiagnoseButton(coordinator, entry),
    ])


class RateAdvisorRefreshButton(CoordinatorEntity[RateAdvisorCoordinator], ButtonEntity):
    _attr_name = "Refresh"
    _attr_icon = "mdi:refresh"
    _attr_has_entity_name = True

    def __init__(self, coordinator: RateAdvisorCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._entry = entry

    @property
    def unique_id(self) -> str:
        return f"{self._entry.entry_id}_refresh"

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "Rate Advisor",
            "manufacturer": "ha-solar-rate-switching-automation",
        }

    async def async_press(self) -> None:
        await self.coordinator.async_refresh()


class RateAdvisorDiagnoseButton(CoordinatorEntity[RateAdvisorCoordinator], ButtonEntity):
    _attr_name = "Run Diagnostics"
    _attr_icon = "mdi:clipboard-text"
    _attr_has_entity_name = True

    def __init__(self, coordinator: RateAdvisorCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._entry = entry

    @property
    def unique_id(self) -> str:
        return f"{self._entry.entry_id}_run_diagnostics"

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "Rate Advisor",
            "manufacturer": "ha-solar-rate-switching-automation",
        }

    async def async_press(self) -> None:
        persistent_notification.async_create(
            self.hass,
            self.coordinator.format_diagnostics(),
            title="Rate Advisor Diagnostics",
            notification_id="rate_advisor_diagnostics",
        )
