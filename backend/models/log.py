"""SQLAlchemy model — Detection log entries."""

import uuid
from sqlalchemy import Column, String, Boolean, Float, Enum as SAEnum
from database import Base


class LogEntry(Base):
    __tablename__ = "log_entries"

    id = Column(String, primary_key=True, default=lambda: f"log-{uuid.uuid4().hex[:8]}")
    timestamp = Column(String, nullable=False)  # ISO datetime
    known = Column(Boolean, nullable=False)
    staff_name = Column(String, nullable=True)
    store_open = Column(Boolean, nullable=False)
    action = Column(SAEnum("Logged Only", "Alert Sent", name="action_taken"), nullable=False)
    confidence = Column(Float, nullable=False)  # 0-100
    snapshot_path = Column(String, nullable=True)  # path to captured frame image
