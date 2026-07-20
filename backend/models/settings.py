"""SQLAlchemy model — Application settings (single-row pattern)."""

from sqlalchemy import Column, Integer, Text
from database import Base

# Settings are stored as a single JSON blob in one row.
# This avoids the complexity of modelling nested hours/rules/channels
# as separate tables while keeping the Pydantic schema as source of truth.


class SettingsRow(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, default=1)
    data = Column(Text, nullable=False)  # JSON string of the full Settings object
