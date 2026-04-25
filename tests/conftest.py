"""Stub out homeassistant imports so coordinator.py can be imported without a running HA instance."""
import sys
import types


def _stub(dotted: str):
    """Ensure every segment of a dotted module path exists in sys.modules."""
    parts = dotted.split(".")
    for i in range(1, len(parts) + 1):
        name = ".".join(parts[:i])
        if name not in sys.modules:
            mod = types.ModuleType(name)
            sys.modules[name] = mod
        if i > 1:
            parent = sys.modules[".".join(parts[:i-1])]
            if not hasattr(parent, parts[i-1]):
                setattr(parent, parts[i-1], sys.modules[name])


for path in [
    "homeassistant",
    "homeassistant.components",
    "homeassistant.components.persistent_notification",
    "homeassistant.components.recorder",
    "homeassistant.components.recorder.statistics",
    "homeassistant.config_entries",
    "homeassistant.core",
    "homeassistant.helpers",
    "homeassistant.helpers.event",
    "homeassistant.helpers.update_coordinator",
    "homeassistant.util",
    "homeassistant.util.dt",
]:
    _stub(path)

# Concrete stubs needed for class definitions / inheritance.
class _FakeCoordinator:
    def __init__(self, *args, **kwargs):
        pass

    def __class_getitem__(cls, item):
        return cls

uc = sys.modules["homeassistant.helpers.update_coordinator"]
uc.DataUpdateCoordinator = _FakeCoordinator
uc.UpdateFailed = Exception

# Bare sentinels for everything else that gets imported by name.
for mod_path, names in [
    ("homeassistant.components.persistent_notification", ["async_create"]),
    ("homeassistant.components.recorder", ["get_instance"]),
    ("homeassistant.components.recorder.statistics", ["statistics_during_period"]),
    ("homeassistant.config_entries", ["ConfigEntry"]),
    ("homeassistant.core", ["HomeAssistant", "ServiceCall"]),
    ("homeassistant.helpers.event", ["async_track_time_change"]),
    ("homeassistant.util.dt", ["now", "as_local"]),
]:
    mod = sys.modules[mod_path]
    for name in names:
        if not hasattr(mod, name):
            setattr(mod, name, None)
