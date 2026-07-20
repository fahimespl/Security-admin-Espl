"""SQLAlchemy model — Staff members with face embeddings."""

import uuid
from sqlalchemy import Column, String, LargeBinary, Enum as SAEnum
from database import Base


class Staff(Base):
    __tablename__ = "staff"

    id = Column(String, primary_key=True, default=lambda: f"s-{uuid.uuid4().hex[:8]}")
    name = Column(String, nullable=False)
    role = Column(SAEnum("Manager", "Sales", "Cleaner", "Security", name="staff_role"), nullable=False)
    enrolled_on = Column(String, nullable=False)  # ISO date
    status = Column(SAEnum("Active", "Inactive", name="staff_status"), nullable=False, default="Active")
    photo_path = Column(String, nullable=True)  # relative path inside storage/
    face_embedding = Column(LargeBinary, nullable=True)  # numpy array serialised as bytes
