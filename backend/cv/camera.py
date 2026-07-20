"""
Camera capture — background thread that reads frames, runs face detection/recognition,
applies the rule engine, and stores results for WebSocket broadcast & MJPEG stream.
"""

import os
import time
import logging
import threading
from datetime import datetime
from typing import List, Tuple, Optional

import numpy as np

from database import SessionLocal
from services.face_recognition_service import recognise_faces, embedding_from_bytes
from services.rule_engine import get_settings, process_detection, is_store_open, is_maintenance_active
from services.alert_dispatcher import dispatch_alert

logger = logging.getLogger(__name__)

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False


class CameraManager:
    """Singleton-ish manager for the background camera loop."""

    def __init__(self):
        self._cap: Optional[object] = None  # cv2.VideoCapture
        self._running = False
        self._is_mock = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        # Latest results — read by WS handler & MJPEG streamer
        self._latest_boxes: List[dict] = []
        self._latest_frame: Optional[np.ndarray] = None  # BGR
        self._latest_jpeg: Optional[bytes] = None

        # Detection interval
        self._interval = int(os.getenv("DETECTION_INTERVAL_MS", "300")) / 1000.0

    # ------ public API ------

    @property
    def running(self) -> bool:
        return self._running

    @property
    def latest_boxes(self) -> List[dict]:
        return self._latest_boxes

    @property
    def is_mock(self) -> bool:
        return self._is_mock

    @property
    def latest_jpeg(self) -> Optional[bytes]:
        return self._latest_jpeg

    def start(self, camera_index: int = 0):
        with self._lock:
            if not CV2_AVAILABLE:
                logger.error("Cannot start camera — OpenCV not available.")
                return
            if self._running:
                logger.info("Camera already running.")
                return

            # Try multiple backends — MSMF (default on Windows) sometimes needs
            # a warm-up read; DSHOW may fail when opening by index on some machines.
            import platform
            backends = [None]  # None = OpenCV default
            if platform.system() == "Windows":
                backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, None]

            self._cap = None
            for backend in backends:
                backend_name = {cv2.CAP_DSHOW: "DSHOW", cv2.CAP_MSMF: "MSMF"}.get(backend, "default") if backend is not None else "default"
                logger.info("Trying camera %d with backend: %s", camera_index, backend_name)
                try:
                    cap = cv2.VideoCapture(camera_index, backend) if backend is not None else cv2.VideoCapture(camera_index)
                except Exception as exc:
                    logger.warning("cv2.VideoCapture raised for backend %s: %s", backend_name, exc)
                    continue

                if not cap.isOpened():
                    logger.info("Backend %s: cap.isOpened() returned False", backend_name)
                    cap.release()
                    continue

                # ---- Performance tuning (set before warm-up) ----
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                cap.set(cv2.CAP_PROP_FPS, 30)

                # Windows DSHOW cameras often need a 1-2 second delay after
                # opening before the sensor auto-exposure settles — without this
                # the first N frames are completely black even though ret=True.
                logger.info("Backend %s: waiting for sensor exposure to settle...", backend_name)
                time.sleep(1.5)

                # Warm-up: read up to 30 frames and require at least one that
                # has a mean brightness above 5/255 (i.e. not a black frame).
                frame_ok = False
                for attempt in range(30):
                    ret, warm_frame = cap.read()
                    if ret and warm_frame is not None:
                        mean_brightness = warm_frame.mean()
                        logger.info(
                            "Backend %s: warm-up attempt %d — brightness=%.1f",
                            backend_name, attempt + 1, mean_brightness,
                        )
                        if mean_brightness > 5.0:  # reject near-black frames
                            frame_ok = True
                            logger.info("Backend %s: warm-up OK on attempt %d (brightness=%.1f)", backend_name, attempt + 1, mean_brightness)
                            break
                    time.sleep(0.1)  # 100ms between retries

                if frame_ok:
                    self._cap = cap
                    break
                else:
                    logger.info("Backend %s: warm-up failed after 30 attempts (all frames black or unreadable)", backend_name)
                    cap.release()

            if self._cap is None:
                logger.warning("Failed to open camera index %d with any backend. Falling back to Simulated Camera Mode.", camera_index)
                self._is_mock = True
            else:
                self._is_mock = False

            self._running = True
            self._thread = threading.Thread(target=self._loop, daemon=True, name="camera-loop")
            self._thread.start()
            if self._is_mock:
                logger.info("Simulated camera started.")
            else:
                logger.info("Camera started on index %d.", camera_index)

    def stop(self):
        with self._lock:
            if not self._running and not self._is_mock and self._cap is None:
                logger.info("Camera already stopped.")
                return
            self._running = False
        # Join outside lock so _loop() can exit cleanly
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None
        with self._lock:
            if self._cap:
                self._cap.release()
                self._cap = None
            self._is_mock = False
            self._latest_boxes = []
            self._latest_frame = None
            self._latest_jpeg = None
        logger.info("Camera stopped.")

    # ------ internal loop ------

    def _load_enrolled(self, db) -> List[Tuple[str, np.ndarray]]:
        """Load all active staff with embeddings from the DB."""
        from models.staff import Staff
        rows = db.query(Staff).filter(
            Staff.status == "Active",
            Staff.face_embedding.isnot(None),
        ).all()
        enrolled = []
        for r in rows:
            try:
                enc = embedding_from_bytes(r.face_embedding)
                enrolled.append((r.name, enc))
            except Exception:
                pass
        return enrolled

    def _loop(self):
        last_detection_time = 0.0
        mock_tick = 0
        while self._running:
            with self._lock:
                cap = self._cap
                is_mock = self._is_mock

            if not is_mock and cap is None:
                time.sleep(0.03)
                continue

            if is_mock:
                # Generate a mock/simulated camera frame
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                # Draw grid lines
                for y in range(0, 480, 60):
                    cv2.line(frame, (0, y), (640, y), (30, 30, 30), 1)
                for x in range(0, 640, 80):
                    cv2.line(frame, (x, 0), (x, 480), (30, 30, 30), 1)
                
                # Bouncing indicator
                mock_tick += 1
                cx = int(320 + 200 * np.sin(mock_tick * 0.05))
                cy = int(240 + 100 * np.cos(mock_tick * 0.07))
                cv2.circle(frame, (cx, cy), 20, (0, 120, 200), -1)

                cv2.putText(frame, "SIMULATED CAMERA (NO WEBCAM ATTACHED)", (70, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                cv2.putText(frame, "Rule engine and alerts are fully active in simulation mode", (60, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (150, 150, 150), 1)
                cv2.putText(frame, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), (20, 450), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            else:
                ret, frame = cap.read()
                if not ret or frame is None:
                    # Camera stalled — yield briefly then retry
                    time.sleep(0.005)
                    continue
                # Skip near-black frames (Windows driver sometimes produces these
                # during auto-exposure settling or after resume from sleep).
                if frame.mean() < 3.0:
                    time.sleep(0.005)
                    continue

            # Encode frame as JPEG for MJPEG streaming immediately (high FPS)
            # Quality 80 — good visual clarity while keeping network throughput reasonable.
            _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            self._latest_jpeg = jpeg.tobytes()
            self._latest_frame = frame

            now_time = time.monotonic()
            if now_time - last_detection_time >= self._interval:
                last_detection_time = now_time

                # Get a DB session for this tick
                db = SessionLocal()
                try:
                    settings = get_settings(db)
                    enrolled = self._load_enrolled(db)
                    threshold = settings.rules.confidence_threshold

                    if is_mock:
                        # Simulate face detections in mock mode
                        # Cycle between detection states: face appears every 10 seconds for 3 seconds
                        boxes = []
                        seconds_in_cycle = int(time.time()) % 10
                        if seconds_in_cycle < 3:
                            name = "Unknown"
                            conf = 45.0
                            # If there are enrolled staff members, alternate simulated identity
                            if enrolled and (int(time.time()) % 20 < 10):
                                name = enrolled[0][0]
                                conf = 85.0
                            
                            boxes = [{
                                "id": "simulated-face",
                                "name": name,
                                "confidence": conf,
                                "x": 0.35,
                                "y": 0.25,
                                "w": 0.3,
                                "h": 0.4
                            }]
                            
                            # Draw face overlay directly on the frame for visual confirmation in the stream
                            fx = int(0.35 * 640)
                            fy = int(0.25 * 480)
                            fw = int(0.3 * 640)
                            fh = int(0.4 * 480)
                            cv2.rectangle(frame, (fx, fy), (fx + fw, fy + fh), (0, 255, 0) if conf >= threshold else (0, 0, 255), 2)
                            cv2.putText(frame, f"{name} ({conf}%)", (fx, fy - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0) if conf >= threshold else (0, 0, 255), 1)
                            # Re-encode with boxes drawn on top; reuse same quality setting.
                            _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                            self._latest_jpeg = jpeg.tobytes()
                    else:
                        # Run real face detection / recognition
                        boxes = recognise_faces(frame, enrolled, threshold)

                    self._latest_boxes = boxes

                    # Run rule engine on each detected face
                    for box in boxes:
                        action = process_detection(
                            db,
                            name=box["name"],
                            confidence=box["confidence"],
                            settings=settings,
                        )
                        # If alert was sent, dispatch through enabled channels
                        if action == "Alert Sent":
                            now_dt = datetime.now()
                            channels = {
                                "whatsapp": settings.channels.whatsapp,
                                "siren": settings.channels.siren,
                                "autoLock": settings.channels.auto_lock,
                            }
                            # Get recipients from settings
                            recipients = [
                                {"name": r.name, "phone": r.phone}
                                for r in settings.recipients
                            ]
                            detection_info = {
                                "name": box["name"],
                                "confidence": box["confidence"],
                                "known": box["confidence"] >= threshold,
                                "timestamp": now_dt.isoformat(),
                            }
                            dispatch_alert(channels, recipients, detection_info)

                except Exception:
                    logger.exception("Error in camera detection loop")
                    try:
                        db.rollback()
                    except Exception:
                        pass
                finally:
                    db.close()

            # No blanket sleep — let the loop run as fast as the camera delivers
            # frames. The real camera's cap.read() blocks until a new frame is
            # available, which naturally throttles CPU usage. For mock mode we
            # add a minimal sleep to avoid spinning at 100% on a tight loop.
            if is_mock:
                time.sleep(0.033)  # ~30 FPS for simulated frames


# Module-level singleton
camera_manager = CameraManager()
