"""
Camera capture — background thread that reads frames, runs face detection/recognition,
applies the rule engine, and stores results for WebSocket broadcast & MJPEG stream.
"""

import os
import time
import logging
import threading
from datetime import datetime
from typing import List, Tuple, Optional, Dict

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


class CameraInstance:
    """Manages a single background camera loop."""

    def __init__(self, cam_id: str):
        self.cam_id = cam_id
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
                logger.error(f"Cannot start camera {self.cam_id} — OpenCV not available.")
                return
            if self._running:
                logger.info(f"Camera {self.cam_id} already running.")
                return

            import platform
            backends = [None]
            if platform.system() == "Windows":
                backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, None]

            self._cap = None
            for backend in backends:
                backend_name = {cv2.CAP_DSHOW: "DSHOW", cv2.CAP_MSMF: "MSMF"}.get(backend, "default") if backend is not None else "default"
                logger.info("Trying camera index %d with backend: %s for cam_id %s", camera_index, backend_name, self.cam_id)
                try:
                    cap = cv2.VideoCapture(camera_index, backend) if backend is not None else cv2.VideoCapture(camera_index)
                except Exception as exc:
                    logger.warning("cv2.VideoCapture raised for backend %s: %s", backend_name, exc)
                    continue

                if not cap.isOpened():
                    logger.info("Backend %s: cap.isOpened() returned False", backend_name)
                    cap.release()
                    continue

                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                cap.set(cv2.CAP_PROP_FPS, 30)

                logger.info("Backend %s: waiting for sensor exposure to settle...", backend_name)
                time.sleep(1.5)

                frame_ok = False
                for attempt in range(30):
                    ret, warm_frame = cap.read()
                    if ret and warm_frame is not None:
                        mean_brightness = warm_frame.mean()
                        if mean_brightness > 5.0:
                            frame_ok = True
                            break
                    time.sleep(0.1)

                if frame_ok:
                    self._cap = cap
                    break
                else:
                    logger.info("Backend %s: warm-up failed after 30 attempts", backend_name)
                    cap.release()

            if self._cap is None:
                logger.warning(
                    f"Failed to open camera index {camera_index} with any backend for cam_id {self.cam_id}. "
                    "Server camera unavailable — browser-based capture will be used instead."
                )
                return

            self._is_mock = False
            self._running = True
            self._thread = threading.Thread(target=self._loop, daemon=True, name=f"camera-loop-{self.cam_id}")
            self._thread.start()
            logger.info("Camera %s started on index %d.", self.cam_id, camera_index)

    def stop(self):
        with self._lock:
            if not self._running and not self._is_mock and self._cap is None:
                return
            self._running = False
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
        logger.info("Camera %s stopped.", self.cam_id)

    def _load_enrolled(self, db) -> List[Tuple[str, np.ndarray]]:
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
        while self._running:
            with self._lock:
                cap = self._cap

            if cap is None:
                time.sleep(0.03)
                continue

            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.005)
                continue

            if frame.mean() < 3.0:
                time.sleep(0.005)
                continue

            _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            self._latest_jpeg = jpeg.tobytes()
            self._latest_frame = frame

            now_time = time.monotonic()
            if now_time - last_detection_time >= self._interval:
                last_detection_time = now_time

                db = SessionLocal()
                try:
                    settings = get_settings(db)
                    enrolled = self._load_enrolled(db)
                    threshold = settings.rules.confidence_threshold

                    boxes = recognise_faces(frame, enrolled, threshold)
                    self._latest_boxes = boxes

                    for box in boxes:
                        action = process_detection(
                            db,
                            name=box["name"],
                            confidence=box["confidence"],
                            settings=settings,
                        )
                        if action == "Alert Sent":
                            now_dt = datetime.now()
                            channels = {
                                "whatsapp": settings.channels.whatsapp,
                                "siren": settings.channels.siren,
                                "autoLock": settings.channels.auto_lock,
                            }
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
                    logger.exception(f"Error in camera {self.cam_id} detection loop")
                    try:
                        db.rollback()
                    except Exception:
                        pass
                finally:
                    db.close()


class CameraManager:
    """Registry of multiple CameraInstances."""
    def __init__(self):
        self._cameras: Dict[str, CameraInstance] = {}
        self._lock = threading.Lock()

    def get_camera(self, cam_id: str) -> CameraInstance:
        with self._lock:
            if cam_id not in self._cameras:
                self._cameras[cam_id] = CameraInstance(cam_id)
            return self._cameras[cam_id]

    @property
    def running(self) -> bool:
        # Backward compatibility for main.py checks
        return any(c.running for c in self._cameras.values())

    def stop(self):
        with self._lock:
            for cam in self._cameras.values():
                cam.stop()
            self._cameras.clear()


# Module-level singleton registry
camera_manager = CameraManager()
