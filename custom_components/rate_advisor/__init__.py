from __future__ import annotations

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.event import async_track_time_change

from .const import DOMAIN
from .coordinator import RateAdvisorCoordinator

PLATFORMS = ["button", "sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = RateAdvisorCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Refresh daily at 00:05 so yesterday's statistics are finalised before we compute.
    async def _refresh_at_midnight(_now) -> None:
        await coordinator.async_refresh()

    entry.async_on_unload(
        async_track_time_change(hass, _refresh_at_midnight, hour=0, minute=5, second=0)
    )

    # Register the diagnose service once (guard against multiple config entries).
    if not hass.services.has_service(DOMAIN, "diagnose"):
        async def _handle_diagnose(_call: ServiceCall) -> None:
            coordinators = hass.data.get(DOMAIN, {})
            coord = next(
                (c for c in coordinators.values() if isinstance(c, RateAdvisorCoordinator)),
                None,
            )
            if coord is None:
                return
            persistent_notification.async_create(
                hass,
                coord.format_diagnostics(),
                title="Rate Advisor Diagnostics",
                notification_id="rate_advisor_diagnostics",
            )

        hass.services.async_register(DOMAIN, "diagnose", _handle_diagnose)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    hass.data[DOMAIN].pop(entry.entry_id)

    # Remove the service when the last entry is unloaded.
    if not hass.data.get(DOMAIN):
        hass.services.async_remove(DOMAIN, "diagnose")

    return True
