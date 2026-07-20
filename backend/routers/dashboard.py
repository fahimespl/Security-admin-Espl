"""
Dashboard router — KPI summary and detections-per-day chart data.
"""

from datetime import datetime, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models.log import LogEntry
from models.staff import Staff

from services.rule_engine import get_settings, is_store_open, is_maintenance_active

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
status_router = APIRouter(prefix="/api", tags=["status"])


def get_current_store_status(db: Session) -> dict:
    settings = get_settings(db)
    now = datetime.now()
    store_open = is_store_open(settings, now)
    maintenance_active = is_maintenance_active(settings, now)

    if maintenance_active:
        status = "override"
    elif store_open:
        status = "open"
    else:
        status = "closed"

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_name = day_names[now.weekday()]
    if settings.hours.per_day:
        day_entry = next((d for d in settings.hours.week if d.day == day_name), None)
        if day_entry:
            today_hours = {
                "open": day_entry.open,
                "close": day_entry.close,
                "closed": day_entry.closed
            }
        else:
            today_hours = {
                "open": settings.hours.default.open,
                "close": settings.hours.default.close,
                "closed": False
            }
    else:
        today_hours = {
            "open": settings.hours.default.open,
            "close": settings.hours.default.close,
            "closed": False
        }

    return {
        "status": status,
        "storeOpen": store_open,
        "overrideActive": maintenance_active,
        "todayHours": today_hours
    }


@status_router.get("/status")
def get_status(db: Session = Depends(get_db)):
    return get_current_store_status(db)


@router.get("/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    """
    KPI counts for the dashboard cards.
    Returns: totalStaff, activeStaff, todayDetections, todayAlerts, totalLogs, status
    """
    total_staff = db.query(Staff).count()
    active_staff = db.query(Staff).filter(Staff.status == "Active").count()

    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    today_detections = db.query(LogEntry).filter(
        LogEntry.timestamp >= today_start
    ).count()

    today_alerts = db.query(LogEntry).filter(
        LogEntry.timestamp >= today_start,
        LogEntry.action == "Alert Sent",
    ).count()

    total_logs = db.query(LogEntry).count()
    status_info = get_current_store_status(db)

    return {
        "totalStaff": total_staff,
        "activeStaff": active_staff,
        "todayDetections": today_detections,
        "todayAlerts": today_alerts,
        "totalLogs": total_logs,
        "status": status_info["status"]
    }


@router.get("/detections")
def detections_per_day(db: Session = Depends(get_db)):
    """
    Detections per day for the last 7 days, used by the dashboard chart.
    Returns: [{ day: "Mon", count: 42 }, ...]
    """
    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    today = datetime.now().date()
    start_date = today - timedelta(days=6)

    # Query all logs in the 7-day window
    start_iso = datetime(start_date.year, start_date.month, start_date.day).isoformat()
    rows = db.query(LogEntry.timestamp).filter(
        LogEntry.timestamp >= start_iso
    ).all()

    # Bucket by actual date (not weekday name) to avoid merging
    # two Mondays when the 7-day window spans them
    counts: dict[str, int] = defaultdict(int)
    for (ts,) in rows:
        try:
            dt = datetime.fromisoformat(ts)
            date_key = dt.date().isoformat()
            counts[date_key] += 1
        except (ValueError, IndexError):
            pass

    # Build result ordered from start_date forward
    result = []
    for i in range(7):
        d = start_date + timedelta(days=i)
        label = day_labels[d.weekday()]
        result.append({"day": label, "count": counts.get(d.isoformat(), 0)})

    return result


@router.get("/hourly-stats")
def get_hourly_stats(db: Session = Depends(get_db)):
    """Return known vs unknown detection counts grouped by hour for the last 12 hours."""
    now = datetime.now()
    twelve_hours_ago = now - timedelta(hours=11)
    
    # We want buckets for the last 12 hours including the current hour
    # e.g., if now is 14:30, buckets are 03:00, 04:00 ... 14:00.
    start_hour = twelve_hours_ago.replace(minute=0, second=0, microsecond=0)
    
    # Initialize buckets
    buckets = {}
    for i in range(12):
        dt = start_hour + timedelta(hours=i)
        time_str = dt.strftime("%-I %p")  # e.g. "3 PM"
        buckets[time_str] = {"time": time_str, "known": 0, "unknown": 0}

    # Query DB
    rows = db.query(LogEntry).filter(
        LogEntry.timestamp >= start_hour.isoformat()
    ).all()

    for row in rows:
        try:
            dt = datetime.fromisoformat(row.timestamp)
            time_str = dt.strftime("%-I %p")
            if time_str in buckets:
                if row.known:
                    buckets[time_str]["known"] += 1
                else:
                    buckets[time_str]["unknown"] += 1
        except Exception:
            pass

    return list(buckets.values())
