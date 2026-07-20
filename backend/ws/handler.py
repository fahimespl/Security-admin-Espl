"""
WebSocket handler — pushes live detection boxes to connected clients.

Endpoint: WS /ws/detections?cam=01
"""

import asyncio
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from cv.camera import camera_manager

logger = logging.getLogger(__name__)

# Connected clients
_clients: set[WebSocket] = set()


async def detections_ws(websocket: WebSocket):
    """
    Accept a WebSocket connection and push Box[] arrays at ~300ms intervals
    as long as the camera is running.
    """
    await websocket.accept()
    _clients.add(websocket)
    logger.info("WebSocket client connected. Total: %d", len(_clients))

    try:
        while True:
            # Push latest boxes with camera state so frontend can
            # distinguish "camera off" from "no detections"
            boxes = camera_manager.latest_boxes
            payload = json.dumps({
                "cameraRunning": camera_manager.running,
                "boxes": boxes,
            })
            await websocket.send_text(payload)
            await asyncio.sleep(0.3)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WebSocket error: %s", exc)
    finally:
        _clients.discard(websocket)
        logger.info("WebSocket client disconnected. Total: %d", len(_clients))
