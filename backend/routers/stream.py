"""
Stream router — MJPEG live stream from the backend camera.

GET /api/stream/mjpeg returns a multipart JPEG boundary stream
that can be displayed in a browser <img> tag.
"""

import os
import time
import logging
import threading
from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse

from cv.camera import camera_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stream", tags=["stream"])

# Prevent concurrent start/stop races from the frontend
_camera_lock = threading.Lock()



def _mjpeg_generator():
    """Yield JPEG frames as multipart boundaries.
    
    Polls the camera manager at ~10 ms intervals and only sends a frame
    when the JPEG buffer has actually changed, avoiding duplicate frames
    and wasted bandwidth.
    """
    last_sent: bytes | None = None
    while camera_manager.running:
        jpeg = camera_manager.latest_jpeg
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
def mjpeg_stream():
    """MJPEG boundary stream endpoint for the frontend <img> element."""
    if not camera_manager.running:
        return StreamingResponse(
            iter([b"Camera not started"]),
            media_type="text/plain",
            status_code=503,
        )
    return StreamingResponse(
        _mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/camera-status")
def camera_status():
    """Check whether the camera is currently running."""
    return {
        "running": camera_manager.running,
        "mock": camera_manager.is_mock,
    }


@router.post("/restart-camera")
def restart_camera():
    """Stop the camera (if running) and try to re-open it."""
    if not _camera_lock.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"status": "busy", "message": "Camera operation already in progress."})
    try:
        camera_index = int(os.getenv("CAMERA_INDEX", "0"))
        camera_manager.stop()
        camera_manager.start(camera_index)
        if camera_manager.running:
            if camera_manager.is_mock:
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


@router.post("/stop-camera")
def stop_camera():
    """Stop the camera capture loop."""
    if not _camera_lock.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"status": "busy", "message": "Camera operation already in progress."})
    try:
        if not camera_manager.running:
            return {"status": "ok", "message": "Camera was not running."}
        camera_manager.stop()
        return {"status": "ok", "message": "Camera stopped."}
    finally:
        _camera_lock.release()
