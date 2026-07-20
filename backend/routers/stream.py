"""
Stream router — camera management and browser-frame processing.

GET  /api/stream/mjpeg           — MJPEG stream (server-camera path)
POST /api/stream/process-frame   — Accept a JPEG frame from the browser,
                                   run face recognition + rule engine,
                                   return detection boxes as JSON.
"""

import os
import io
import time
import logging
import threading
from datetime import datetime

import numpy as np

from fastapi import APIRouter, UploadFile, File, Depends, Form
from fastapi.responses import StreamingResponse, JSONResponse

from middleware.auth import require_api_key
from cv.camera import camera_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stream", tags=["stream"])

# Prevent concurrent start/stop races from the frontend
_camera_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Browser-camera path: process a single JPEG frame sent from the browser
# ---------------------------------------------------------------------------

@router.post("/process-frame")
async def process_frame(
    frame: UploadFile = File(...),
    cam: str = Form("0")
):
    """
    Accept a JPEG image captured by the browser (getUserMedia → canvas.toBlob),
    run face detection / recognition and the rule engine, and return boxes.

    Response shape (same as WebSocket payload for backward compatibility):
        { cameraRunning: true, boxes: [ { id, name, confidence, x, y, w, h } ] }
    """
    try:
        import cv2
        CV2_OK = True
    except ImportError:
        CV2_OK = False

    if not CV2_OK:
        return JSONResponse(
            status_code=503,
            content={"cameraRunning": False, "boxes": [], "error": "OpenCV not available on server."},
        )

    try:
        contents = await frame.read()
        nparr = np.frombuffer(contents, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as exc:
        logger.warning("process-frame: failed to decode image — %s", exc)
        return JSONResponse(
            status_code=400,
            content={"cameraRunning": True, "boxes": [], "error": "Could not decode image."},
        )

    if img_bgr is None:
        return JSONResponse(
            status_code=400,
            content={"cameraRunning": True, "boxes": [], "error": "Empty or unreadable image."},
        )

    # ---- Face recognition ----
    from database import SessionLocal
    from services.face_recognition_service import recognise_faces, embedding_from_bytes
    from services.rule_engine import get_settings, process_detection
    from services.alert_dispatcher import dispatch_alert
    from models.staff import Staff

    db = SessionLocal()
    boxes = []
    try:
        settings = get_settings(db)
        threshold = settings.rules.confidence_threshold

        # Load enrolled staff embeddings
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

        boxes = recognise_faces(img_bgr, enrolled, threshold)

        # Run rule engine on each detected face
        for box in boxes:
            res = process_detection(
                db,
                name=box["name"],
                confidence=box["confidence"],
                settings=settings,
            )
            action = res["action"]
            log_id = res["log_id"]

            # Save snapshot for evidence
            from services.storage_service import upload_photo
            from models.log import LogEntry
            snapshot_url = None
            try:
                filename = f"snap-{log_id}.jpg"
                snapshot_url = upload_photo(contents, filename)
                # Update the log entry with the snapshot path
                log_row = db.query(LogEntry).filter(LogEntry.id == log_id).first()
                if log_row:
                    log_row.snapshot_path = snapshot_url
                    db.commit()
            except Exception as e:
                logger.error(f"Failed to save snapshot for log {log_id}: {e}")

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
                dispatch_alert(channels, recipients, detection_info, snapshot_url=snapshot_url)

    except Exception:
        logger.exception("process-frame: error in face recognition / rule engine")
    finally:
        db.close()

    return {"cameraRunning": True, "boxes": boxes}



def _mjpeg_generator(cam_id: str):
    """Yield JPEG frames as multipart boundaries.
    
    Polls the camera manager at ~10 ms intervals and only sends a frame
    when the JPEG buffer has actually changed, avoiding duplicate frames
    and wasted bandwidth.
    """
    cam_inst = camera_manager.get_camera(cam_id)
    last_sent: bytes | None = None
    while cam_inst.running:
        jpeg = cam_inst.latest_jpeg
        if jpeg and jpeg is not last_sent:
            last_sent = jpeg
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + jpeg
                + b"\r\n"
            )
        time.sleep(0.01)  # Poll at ~100 Hz; real rate capped by camera loop output


@router.get("/mjpeg")
def mjpeg_stream(cam: str = "0"):
    """MJPEG boundary stream endpoint for the frontend <img> element."""
    cam_inst = camera_manager.get_camera(cam)
    if not cam_inst.running:
        return StreamingResponse(
            iter([b"Camera not started"]),
            media_type="text/plain",
            status_code=503,
        )
    return StreamingResponse(
        _mjpeg_generator(cam),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/camera-status")
def camera_status(cam: str = "0"):
    """Check whether the camera is currently running."""
    cam_inst = camera_manager.get_camera(cam)
    return {
        "running": cam_inst.running,
        "mock": cam_inst.is_mock,
    }


@router.post("/restart-camera", dependencies=[Depends(require_api_key)])
def restart_camera(cam: str = "0"):
    """Stop the camera (if running) and try to re-open it."""
    if not _camera_lock.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"status": "busy", "message": "Camera operation already in progress."})
    try:
        camera_index = int(os.getenv("CAMERA_INDEX", "0"))
        cam_inst = camera_manager.get_camera(cam)
        cam_inst.stop()
        cam_inst.start(camera_index)
        if cam_inst.running:
            if cam_inst.is_mock:
                return {
                    "status": "ok",
                    "mock": True,
                    "message": f"No webcam found on index {camera_index}. Running in simulated mode.",
                }
            return {
                "status": "ok",
                "mock": False,
                "message": f"Camera {camera_index} started successfully.",
            }
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": f"Failed to open camera {camera_index}. Check that no other app is using it."},
        )
    finally:
        _camera_lock.release()


@router.post("/stop-camera", dependencies=[Depends(require_api_key)])
def stop_camera(cam: str = "0"):
    """Stop the camera capture loop."""
    if not _camera_lock.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"status": "busy", "message": "Camera operation already in progress."})
    try:
        cam_inst = camera_manager.get_camera(cam)
        if not cam_inst.running:
            return {"status": "ok", "message": "Camera was not running."}
        cam_inst.stop()
        return {"status": "ok", "message": "Camera stopped."}
    finally:
        _camera_lock.release()

