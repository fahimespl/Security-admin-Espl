"""Pydantic schemas — Detection boxes (sent over WebSocket)."""

from pydantic import BaseModel


class BoxSchema(BaseModel):
    id: str
    name: str           # matched staff name or "Unknown"
    confidence: float   # 0-100
    x: float            # normalised 0-1
    y: float
    w: float
    h: float
