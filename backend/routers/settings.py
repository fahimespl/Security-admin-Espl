"""
Settings router — GET/PUT the application settings.

Settings are stored as a single JSON row in the DB.
On first GET, seed with defaults from schemas/settings.py.
"""

import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.settings import SettingsRow
from schemas.settings import SettingsSchema, DEFAULT_SETTINGS

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _get_or_seed(db: Session) -> SettingsSchema:
    """Return current settings, seeding defaults if table is empty."""
    row = db.query(SettingsRow).filter(SettingsRow.id == 1).first()
    if row:
        return SettingsSchema.model_validate_json(row.data)

    # Seed defaults
    row = SettingsRow(id=1, data=DEFAULT_SETTINGS.model_dump_json(by_alias=True))
    db.add(row)
    db.commit()
    return DEFAULT_SETTINGS


@router.get("")
def get_settings(db: Session = Depends(get_db)):
    settings = _get_or_seed(db)
    return json.loads(settings.model_dump_json(by_alias=True))


@router.put("")
def update_settings(payload: SettingsSchema, db: Session = Depends(get_db)):
    row = db.query(SettingsRow).filter(SettingsRow.id == 1).first()
    data_json = payload.model_dump_json(by_alias=True)
    if row:
        row.data = data_json
    else:
        row = SettingsRow(id=1, data=data_json)
        db.add(row)
    db.commit()
    return json.loads(data_json)
