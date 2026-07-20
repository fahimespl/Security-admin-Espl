"""Pydantic schemas — Alert recipients."""

from pydantic import BaseModel


class RecipientCreate(BaseModel):
    name: str
    phone: str


class RecipientOut(BaseModel):
    id: str
    name: str
    phone: str
