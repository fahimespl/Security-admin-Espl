"""
Alerts router — manage recipients + send test alerts.
"""

import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import require_api_key
from models.recipient import AlertRecipient
from schemas.recipient import RecipientCreate, RecipientOut
from services.rule_engine import get_settings
from services.alert_dispatcher import dispatch_alert

router = APIRouter(prefix="/api", tags=["alerts"])


@router.post("/recipients", response_model=RecipientOut, status_code=201, dependencies=[Depends(require_api_key)])
def add_recipient(body: RecipientCreate, db: Session = Depends(get_db)):
    row = AlertRecipient(
        id=f"r-{uuid.uuid4().hex[:8]}",
        name=body.name,
        phone=body.phone,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # Also update the recipients list inside the settings JSON
    _sync_recipients_to_settings(db)

    return {"id": row.id, "name": row.name, "phone": row.phone}


@router.delete("/recipients/{recipient_id}", status_code=204, dependencies=[Depends(require_api_key)])
def remove_recipient(recipient_id: str, db: Session = Depends(get_db)):
    row = db.query(AlertRecipient).filter(AlertRecipient.id == recipient_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Recipient not found")
    db.delete(row)
    db.commit()

    _sync_recipients_to_settings(db)


@router.post("/alerts/test", dependencies=[Depends(require_api_key)])
def test_alert(db: Session = Depends(get_db)):
    """Send a real test alert through all enabled channels."""
    settings = get_settings(db)
    recipients = [{"name": r.name, "phone": r.phone} for r in settings.recipients]

    if not recipients:
        # Try DB recipients table directly
        rows = db.query(AlertRecipient).all()
        recipients = [{"name": r.name, "phone": r.phone} for r in rows]

    channels = {
        "whatsapp": settings.channels.whatsapp,
        "siren": settings.channels.siren,
        "autoLock": settings.channels.auto_lock,
    }

    detection_info = {
        "name": "Test Person",
        "confidence": 95.0,
        "known": True,
        "timestamp": datetime.now().isoformat(),
    }

    results = dispatch_alert(channels, recipients, detection_info)
    return {"status": "test_sent", "results": results}


def _sync_recipients_to_settings(db: Session):
    """
    Keep the recipients array inside the settings JSON in sync
    with the alert_recipients table.
    """
    from models.settings import SettingsRow
    from schemas.settings import SettingsSchema, RecipientSchema

    row = db.query(SettingsRow).filter(SettingsRow.id == 1).first()
    if not row:
        return

    settings = SettingsSchema.model_validate_json(row.data)
    db_recipients = db.query(AlertRecipient).all()
    settings.recipients = [
        RecipientSchema(id=r.id, name=r.name, phone=r.phone)
        for r in db_recipients
    ]

    row.data = settings.model_dump_json(by_alias=True)
    db.commit()
