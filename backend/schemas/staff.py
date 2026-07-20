"""Pydantic schemas — Staff members.

All schemas use camelCase aliases so the JSON payload matches
the frontend TypeScript types in lib/types.ts exactly.
"""

from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict


def _to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(w.capitalize() for w in parts[1:])


class StaffBase(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    name: str
    role: Literal["Manager", "Sales", "Cleaner", "Security"]
    enrolled_on: str  # ISO date
    status: Literal["Active", "Inactive"] = "Active"
    photo: Optional[str] = None  # URL/path to stored image


class StaffCreate(BaseModel):
    """Used for multipart form — photo comes as UploadFile, not in the schema."""
    name: str
    role: Literal["Manager", "Sales", "Cleaner", "Security"]
    status: Literal["Active", "Inactive"] = "Active"


class StaffUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    name: Optional[str] = None
    role: Optional[Literal["Manager", "Sales", "Cleaner", "Security"]] = None
    status: Optional[Literal["Active", "Inactive"]] = None


class StaffOut(StaffBase):
    id: str
    has_embedding: bool
