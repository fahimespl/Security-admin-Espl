"""SQLAlchemy model — Cooldown tracker for alert rate-limiting.

Persists the last alert timestamp per identity so that cooldowns
survive backend restarts and redeployments.
"""

from sqlalchemy import Column, String
from database import Base


class CooldownEntry(Base):
    __tablename__ = "cooldown_tracker"

    identity_key = Column(String, primary_key=True)   # staff name or "__unknown__"
    last_alert_at = Column(String, nullable=False)     # ISO datetime
