"""
Logs router — filtered log listing.

GET /api/logs?from=&to=&known=&action=
"""

import io
import csv
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
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


@router.get("")
def get_logs(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    known: Optional[bool] = None,
    action: Optional[str] = None,
    store_open: Optional[bool] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(LogEntryModel)

    if from_date:
        q = q.filter(LogEntryModel.timestamp >= from_date)
    if to_date:
        # Add 23:59:59 to include the whole day if only date is passed
        end_time = to_date if "T" in to_date else f"{to_date}T23:59:59"
        q = q.filter(LogEntryModel.timestamp <= end_time)
    if known is not None:
        q = q.filter(LogEntryModel.known == known)
    if action:
        q = q.filter(LogEntryModel.action == action)
    if store_open is not None:
        q = q.filter(LogEntryModel.store_open == store_open)

    total = q.count()
    rows = q.order_by(LogEntryModel.timestamp.desc()).offset((page - 1) * limit).limit(limit).all()
    
    return {
        "items": [_row_to_out(r) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@router.get("/export")
def export_logs(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    known: Optional[bool] = None,
    action: Optional[str] = None,
    store_open: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    q = db.query(LogEntryModel)

    if from_date:
        q = q.filter(LogEntryModel.timestamp >= from_date)
    if to_date:
        end_time = to_date if "T" in to_date else f"{to_date}T23:59:59"
        q = q.filter(LogEntryModel.timestamp <= end_time)
    if known is not None:
        q = q.filter(LogEntryModel.known == known)
    if action:
        q = q.filter(LogEntryModel.action == action)
    if store_open is not None:
        q = q.filter(LogEntryModel.store_open == store_open)

    rows = q.order_by(LogEntryModel.timestamp.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Timestamp", "Name", "Known", "Store Open", "Action", "Confidence", "Snapshot URL"
    ])
    
    for row in rows:
        writer.writerow([
            row.id,
            row.timestamp,
            row.staff_name or "",
            "Yes" if row.known else "No",
            "Yes" if row.store_open else "No",
            row.action,
            f"{row.confidence}%",
            row.snapshot_path or ""
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=logs_export.csv"}
    )
