"""SQLAlchemy model — Alert recipients (WhatsApp contacts)."""

import uuid
from sqlalchemy import Column, String
from database import Base


class AlertRecipient(Base):
    __tablename__ = "alert_recipients"

    id = Column(String, primary_key=True, default=lambda: f"r-{uuid.uuid4().hex[:8]}")
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
