from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector

from .const import (
    CONF_DAYS,
    CONF_HI_RATE,
    CONF_LO_RATE,
    CONF_NET_SENSOR,
    DEFAULT_DAYS,
    DEFAULT_HI_RATE,
    DEFAULT_LO_RATE,
    DEFAULT_NET_SENSOR,
    DOMAIN,
)

_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_NET_SENSOR, default=DEFAULT_NET_SENSOR): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="sensor")
        ),
        vol.Required(CONF_HI_RATE, default=DEFAULT_HI_RATE): selector.NumberSelector(
            selector.NumberSelectorConfig(min=0.01, max=2.0, step=0.01, mode="box")
        ),
        vol.Required(CONF_LO_RATE, default=DEFAULT_LO_RATE): selector.NumberSelector(
            selector.NumberSelectorConfig(min=0.01, max=2.0, step=0.01, mode="box")
        ),
        vol.Required(CONF_DAYS, default=DEFAULT_DAYS): selector.NumberSelector(
            selector.NumberSelectorConfig(min=7, max=90, step=1, mode="box")
        ),
    }
)


class RateAdvisorConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="Rate Advisor", data=user_input)

        return self.async_show_form(step_id="user", data_schema=_SCHEMA)
