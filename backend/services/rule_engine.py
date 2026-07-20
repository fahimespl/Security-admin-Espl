"""
Rule Engine — server-side decision logic.

Applies confidence_threshold, cooldown, store-hours, maintenance windows,
and determines whether each detection should trigger an alert or just be logged.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from models.settings import SettingsRow
from models.log import LogEntry
from schemas.settings import SettingsSchema, DEFAULT_SETTINGS

logger = logging.getLogger(__name__)

# Per-identity cooldown tracker:  identity_key → last_alert_datetime
_cooldown_tracker: dict[str, datetime] = {}


def get_settings(db: Session) -> SettingsSchema:
    """Load current settings from DB, or return defaults if none exist."""
    row = db.query(SettingsRow).filter(SettingsRow.id == 1).first()
    if row:
        return SettingsSchema.model_validate_json(row.data)
    return DEFAULT_SETTINGS


def is_store_open(settings: SettingsSchema, now: Optional[datetime] = None) -> bool:
    """
    Check if the store is currently open based on settings.hours.
    """
    now = now or datetime.now()
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_name = day_names[now.weekday()]

    if settings.hours.per_day:
        day_entry = next((d for d in settings.hours.week if d.day == day_name), None)
        if day_entry:
            if day_entry.closed:
                return False
            open_h, open_m = map(int, day_entry.open.split(":"))
            close_h, close_m = map(int, day_entry.close.split(":"))
        else:
            open_h, open_m = map(int, settings.hours.default.open.split(":"))
            close_h, close_m = map(int, settings.hours.default.close.split(":"))
    else:
        open_h, open_m = map(int, settings.hours.default.open.split(":"))
        close_h, close_m = map(int, settings.hours.default.close.split(":"))

    current_minutes = now.hour * 60 + now.minute
    open_minutes = open_h * 60 + open_m
    close_minutes = close_h * 60 + close_m

    return open_minutes <= current_minutes < close_minutes


def is_maintenance_active(settings: SettingsSchema, now: Optional[datetime] = None) -> bool:
    """
    Check if maintenance window is active.
    Handles windows that wrap past midnight (e.g. 22:00 → 05:00).
    """
    if not settings.rules.maintenance_mode:
        return False

    now = now or datetime.now()
    current_minutes = now.hour * 60 + now.minute
    start_h, start_m = map(int, settings.rules.maintenance_start.split(":"))
    end_h, end_m = map(int, settings.rules.maintenance_end.split(":"))
    start = start_h * 60 + start_m
    end = end_h * 60 + end_m

    if start <= end:
        return start <= current_minutes < end
    else:
        # Wraps past midnight
        return current_minutes >= start or current_minutes < end


def check_cooldown(identity_key: str, cooldown_seconds: int) -> bool:
    """
    Returns True if an alert should fire (cooldown has elapsed).
    Returns False if we're still within the cooldown window.
    """
    now = datetime.now()
    last = _cooldown_tracker.get(identity_key)
    if last and (now - last) < timedelta(seconds=cooldown_seconds):
        return False
    return True


def record_alert(identity_key: str):
    """Mark that an alert was just sent for this identity."""
    _cooldown_tracker[identity_key] = datetime.now()


def process_detection(
    db: Session,
    name: str,
    confidence: float,
    settings: SettingsSchema,
) -> str:
    """
    Apply the full rule engine to a single detected face.

    Rules (original spec):
    - During closed hours, alert on ANY detected face (known or unknown)
      when maintenance is NOT active and cooldown has elapsed.
    - During open hours, just log.

    Returns the action taken: "Alert Sent" or "Logged Only".
    """
    now = datetime.now()
    store_open = is_store_open(settings, now)
    maintenance_active = is_maintenance_active(settings, now)
    known = confidence >= settings.rules.confidence_threshold

    # Identity key for cooldown tracking
    identity_key = name if known else "__unknown__"

    # Determine action
    should_alert = False
    if not store_open and not maintenance_active:
        # Closed hours + no maintenance → alert on ANY face
        if check_cooldown(identity_key, settings.rules.cooldown_seconds):
            should_alert = True
            record_alert(identity_key)

    action = "Alert Sent" if should_alert else "Logged Only"

    # Write log entry
    log = LogEntry(
        timestamp=now.isoformat(),
        known=known,
        staff_name=name if known else None,
        store_open=store_open,
        action=action,
        confidence=round(confidence, 1),
    )
    db.add(log)
    db.commit()

    return action
