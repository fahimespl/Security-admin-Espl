"""Pydantic schemas — Log entries."""

from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict


def _to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(w.capitalize() for w in parts[1:])


class LogEntryOut(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    id: str
    timestamp: str  # ISO datetime
    known: bool
    staff_name: Optional[str] = None
    store_open: bool
    action: Literal["Logged Only", "Alert Sent"]
    confidence: float  # 0-100
    snapshot_path: Optional[str] = None
