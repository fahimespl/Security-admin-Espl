"""Pydantic schemas — Application settings.

Matches the frontend Settings interface in lib/types.ts exactly.
"""

from typing import List, Literal
from pydantic import BaseModel, ConfigDict


def _to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(w.capitalize() for w in parts[1:])


class DayHours(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    day: str
    open: str   # HH:mm
    close: str  # HH:mm
    closed: bool


class DefaultHours(BaseModel):
    open: str   # HH:mm
    close: str  # HH:mm


class HoursSettings(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    per_day: bool
    default: DefaultHours
    week: List[DayHours]


class RulesSettings(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    cooldown_seconds: int
    confidence_threshold: float  # 0-100
    maintenance_mode: bool
    maintenance_start: str  # HH:mm
    maintenance_end: str    # HH:mm


class ChannelsSettings(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    whatsapp: bool
    siren: bool
    auto_lock: bool


class RecipientSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    id: str
    name: str
    phone: str


class SettingsSchema(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    system_mode: Literal["test", "live"]
    hours: HoursSettings
    rules: RulesSettings
    channels: ChannelsSettings
    recipients: List[RecipientSchema]


# ---------- Default settings (matches INITIAL_SETTINGS in mock-data.ts) ----------

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

DEFAULT_SETTINGS = SettingsSchema(
    system_mode="test",
    hours=HoursSettings(
        per_day=False,
        default=DefaultHours(open="10:00", close="20:00"),
        week=[
            DayHours(day=d, open="10:00", close="18:00" if d == "Sunday" else "20:00", closed=False)
            for d in DAYS
        ],
    ),
    rules=RulesSettings(
        cooldown_seconds=30,
        confidence_threshold=75,
        maintenance_mode=False,
        maintenance_start="02:00",
        maintenance_end="05:00",
    ),
    channels=ChannelsSettings(whatsapp=True, siren=False, auto_lock=False),
    recipients=[],
)
