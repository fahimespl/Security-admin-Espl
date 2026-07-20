"""
Logs router — filtered log listing.

GET /api/logs?from=&to=&known=&action=
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models.log import LogEntry as LogEntryModel
from schemas.log import LogEntryOut

router = APIRouter(prefix="/api/logs", tags=["logs"])


def _row_to_out(row: LogEntryModel) -> dict:
    return {
        "id": row.id,
        "timestamp": row.timestamp,
        "known": row.known,
        "staffName": row.staff_name,
        "storeOpen": row.store_open,
        "action": row.action,
        "confidence": row.confidence,
        "snapshotPath": row.snapshot_path,
    }


@router.get("", response_model=List[LogEntryOut])
def get_logs(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    known: Optional[bool] = None,
    action: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(LogEntryModel)

    if from_date:
        q = q.filter(LogEntryModel.timestamp >= from_date)
    if to_date:
        q = q.filter(LogEntryModel.timestamp <= to_date)
    if known is not None:
        q = q.filter(LogEntryModel.known == known)
    if action:
        q = q.filter(LogEntryModel.action == action)

    rows = q.order_by(LogEntryModel.timestamp.desc()).limit(200).all()
    return [_row_to_out(r) for r in rows]
