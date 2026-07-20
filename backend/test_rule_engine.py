import unittest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import Base
from models.log import LogEntry
from schemas.settings import SettingsSchema, HoursSettings, DefaultHours, DayHours, RulesSettings, ChannelsSettings
from services.rule_engine import (
    is_store_open,
    is_maintenance_active,
    check_cooldown,
    process_detection,
    _cooldown_tracker
)

class TestRuleEngineSpec(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite database
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Reset cooldown tracker
        _cooldown_tracker.clear()

        # Build settings
        self.settings = SettingsSchema(
            system_mode="test",
            hours=HoursSettings(
                per_day=False,
                default=DefaultHours(open="10:00", close="20:00"),
                week=[
                    DayHours(day=d, open="10:00", close="20:00", closed=False)
                    for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                ]
            ),
            rules=RulesSettings(
                cooldown_seconds=30,
                confidence_threshold=75.0,
                maintenance_mode=False,
                maintenance_start="02:00",
                maintenance_end="05:00"
            ),
            channels=ChannelsSettings(whatsapp=True, siren=False, auto_lock=False),
            recipients=[]
        )

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)

    def test_store_open_logic(self):
        # Open: 10:00 to 20:00
        # 09:59 -> closed
        t_closed_before = datetime(2026, 7, 13, 9, 59)
        self.assertFalse(is_store_open(self.settings, t_closed_before))

        # 10:00 -> open
        t_open = datetime(2026, 7, 13, 10, 0)
        self.assertTrue(is_store_open(self.settings, t_open))

        # 20:00 -> closed
        t_closed_after = datetime(2026, 7, 13, 20, 0)
        self.assertFalse(is_store_open(self.settings, t_closed_after))

    def test_maintenance_active_wrap_midnight(self):
        # Window: 22:00 to 05:00
        self.settings.rules.maintenance_mode = True
        self.settings.rules.maintenance_start = "22:00"
        self.settings.rules.maintenance_end = "05:00"

        # 23:00 -> active
        t_active_before = datetime(2026, 7, 13, 23, 0)
        self.assertTrue(is_maintenance_active(self.settings, t_active_before))

        # 02:00 -> active
        t_active_after = datetime(2026, 7, 13, 2, 0)
        self.assertTrue(is_maintenance_active(self.settings, t_active_after))

        # 12:00 -> inactive
        t_inactive = datetime(2026, 7, 13, 12, 0)
        self.assertFalse(is_maintenance_active(self.settings, t_inactive))

    def test_process_detection_store_open(self):
        # Force store open by setting open hours to cover the current time
        # Get current time
        now = datetime.now()
        start_hour = (now.hour - 1) % 24
        end_hour = (now.hour + 1) % 24
        self.settings.hours.default.open = f"{start_hour:02d}:00"
        self.settings.hours.default.close = f"{end_hour:02d}:00"

        # Even with an unknown face (confidence = 50%), it should just log
        action = process_detection(self.db, "Unknown", 50.0, self.settings)
        self.assertEqual(action, "Logged Only")

        # Verify database log entry
        logs = self.db.query(LogEntry).all()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].action, "Logged Only")
        self.assertEqual(logs[0].known, False)
        self.assertTrue(logs[0].store_open)

    def test_process_detection_store_closed_unknown(self):
        # Force store closed by setting open hours that do NOT cover current time
        now = datetime.now()
        start_hour = (now.hour + 1) % 24
        end_hour = (now.hour + 2) % 24
        self.settings.hours.default.open = f"{start_hour:02d}:00"
        self.settings.hours.default.close = f"{end_hour:02d}:00"

        # Unknown face -> should alert
        action = process_detection(self.db, "Unknown", 50.0, self.settings)
        self.assertEqual(action, "Alert Sent")

        logs = self.db.query(LogEntry).all()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].action, "Alert Sent")
        self.assertEqual(logs[0].known, False)
        self.assertFalse(logs[0].store_open)

    def test_process_detection_store_closed_known_staff(self):
        # Force store closed
        now = datetime.now()
        start_hour = (now.hour + 1) % 24
        end_hour = (now.hour + 2) % 24
        self.settings.hours.default.open = f"{start_hour:02d}:00"
        self.settings.hours.default.close = f"{end_hour:02d}:00"

        # Known face (confidence = 80.0 >= threshold = 75.0)
        # CLOSED hours + known staff face -> alert STILL fires (per spec!)
        action = process_detection(self.db, "Aarav Shah", 80.0, self.settings)
        self.assertEqual(action, "Alert Sent")

        logs = self.db.query(LogEntry).all()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].action, "Alert Sent")
        self.assertEqual(logs[0].known, True)
        self.assertEqual(logs[0].staff_name, "Aarav Shah")

    def test_process_detection_cooldown(self):
        # Force store closed
        now = datetime.now()
        start_hour = (now.hour + 1) % 24
        end_hour = (now.hour + 2) % 24
        self.settings.hours.default.open = f"{start_hour:02d}:00"
        self.settings.hours.default.close = f"{end_hour:02d}:00"

        # Set cooldown to 10 seconds
        self.settings.rules.cooldown_seconds = 10

        # First detection: alert sent
        action1 = process_detection(self.db, "Aarav Shah", 80.0, self.settings)
        self.assertEqual(action1, "Alert Sent")

        # Second detection immediately: suppressed (Logged Only)
        action2 = process_detection(self.db, "Aarav Shah", 82.0, self.settings)
        self.assertEqual(action2, "Logged Only")

        # Different identity: alert sent (cooldown is per-identity!)
        action3 = process_detection(self.db, "Priya Mehta", 85.0, self.settings)
        self.assertEqual(action3, "Alert Sent")

    def test_process_detection_maintenance_mode(self):
        # Force store closed
        now = datetime.now()
        start_hour = (now.hour + 1) % 24
        end_hour = (now.hour + 2) % 24
        self.settings.hours.default.open = f"{start_hour:02d}:00"
        self.settings.hours.default.close = f"{end_hour:02d}:00"

        # Enable maintenance window that covers the current time
        self.settings.rules.maintenance_mode = True
        self.settings.rules.maintenance_start = f"{now.hour:02d}:00"
        self.settings.rules.maintenance_end = f"{(now.hour + 1) % 24:02d}:00"

        # Detection occurs inside maintenance window -> suppressed (Logged Only)
        action = process_detection(self.db, "Unknown", 50.0, self.settings)
        self.assertEqual(action, "Logged Only")

    def test_get_current_store_status(self):
        from routers.dashboard import get_current_store_status
        from models.settings import SettingsRow

        # Seed settings in our in-memory db
        row = SettingsRow(id=1, data=self.settings.model_dump_json(by_alias=True))
        self.db.add(row)
        self.db.commit()

        status_info = get_current_store_status(self.db)
        self.assertIn("status", status_info)
        self.assertIn("storeOpen", status_info)
        self.assertIn("overrideActive", status_info)
        self.assertIn("todayHours", status_info)

if __name__ == "__main__":
    unittest.main()
