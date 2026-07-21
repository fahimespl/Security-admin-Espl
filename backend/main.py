"""
Esamyak — FastAPI Backend

Main application entry point.
Starts the server, mounts all routers, configures CORS,
serves stored photos, and starts the camera on startup.
"""

import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import create_tables
from cv.camera import camera_manager
from ws.handler import detections_ws

# Import all models so they register with Base.metadata
import models  # noqa: F401

from routers.staff import router as staff_router
from routers.settings import router as settings_router
from routers.logs import router as logs_router
from routers.alerts import router as alerts_router
from routers.dashboard import router as dashboard_router, status_router
from routers.stream import router as stream_router

# ---------- Logging ----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("esamyak")


# ---------- Lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Creating database tables...")
    create_tables()
    logger.info("Tables ready. Camera will start only when requested via the frontend.")

    yield

    # Shutdown — stop camera if it was started
    if camera_manager.running:
        logger.info("Stopping camera...")
        camera_manager.stop()


# ---------- App ----------
app = FastAPI(
    title="Esamyak API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow any origin since we rely on X-API-Key for auth
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve stored staff photos and snapshots
STORAGE_ROOT = os.path.join(os.path.dirname(__file__), "storage")
os.makedirs(os.path.join(STORAGE_ROOT, "photos"), exist_ok=True)
os.makedirs(os.path.join(STORAGE_ROOT, "snapshots"), exist_ok=True)
app.mount("/storage", StaticFiles(directory=STORAGE_ROOT), name="storage")

# Mount REST routers
app.include_router(staff_router)
app.include_router(settings_router)
app.include_router(logs_router)
app.include_router(alerts_router)
app.include_router(dashboard_router)
app.include_router(status_router)
app.include_router(stream_router)


# WebSocket endpoint
@app.websocket("/ws/detections")
async def ws_detections(websocket: WebSocket):
    await detections_ws(websocket)


# Root route
@app.get("/")
def root():
    return {
        "name": "Esamyak Security Admin API",
        "status": "online",
        "docs": "/docs",
        "health": "/api/health"
    }


# Health check
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "camera": camera_manager.running,
    }
