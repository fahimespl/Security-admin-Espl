# Esamyak — Backend

FastAPI backend for the Esamyak jewelry store security panel. Provides real face detection/recognition, rule engine, alert dispatch, and REST + WebSocket APIs for the Next.js frontend.

## Prerequisites

- **Python 3.11+** — [Download](https://www.python.org/downloads/)
- **pip** (comes with Python)
- **Webcam** connected to this machine (for live detection)

### Windows-specific: dlib / face_recognition

The `face_recognition` library depends on `dlib` which requires C++ compilation. Options:

1. **Easiest — pre-built wheel:**
   ```bash
   pip install dlib --find-links https://github.com/z-mahmud22/Dlib_Windows_Python3.x/raw/main/dlib-19.24.99-cp311-cp311-win_amd64.whl
   ```
   Adjust the URL for your Python version (cp311 = Python 3.11).

2. **Standard (requires Visual Studio Build Tools):**
   ```bash
   pip install cmake
   pip install dlib
   pip install face_recognition
   ```

3. **Skip it entirely:** If dlib fails to install, remove `face_recognition` and `dlib` from `requirements.txt` — the server will still start and use OpenCV's Haar Cascade for face detection (no recognition, all faces show as "Unknown").

## Setup

```bash
# 1. Create virtual environment
cd backend
python -m venv venv
venv\Scripts\activate     # Windows
# source venv/bin/activate  # Linux/Mac

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy environment variables
copy .env.example .env    # Windows
# cp .env.example .env    # Linux/Mac

# 4. (Optional) Set your Twilio credentials in .env for WhatsApp alerts
```

## Running

```bash
# From the backend/ directory with venv activated:
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

The server will:
- Create `esamyak.db` (SQLite) on first run
- Start the webcam capture loop automatically
- Serve the API at `http://localhost:8001`
- API docs at `http://localhost:8001/docs`

## Pointing the Frontend

In the **`frontend/`** directory (sibling to `backend/`), the `.env.local` is already configured:

```
NEXT_PUBLIC_API_BASE=http://localhost:8001
NEXT_PUBLIC_WS_BASE=ws://localhost:8001
```

Then start the frontend:

```bash
cd ../frontend
npm install
npm run dev
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/staff` | List all staff |
| POST | `/api/staff` (multipart) | Enroll new staff with face photo |
| PATCH | `/api/staff/{id}` | Update staff |
| DELETE | `/api/staff/{id}` | Remove staff |
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |
| GET | `/api/logs?from=&to=&known=&action=` | Filtered logs |
| POST | `/api/recipients` | Add alert recipient |
| DELETE | `/api/recipients/{id}` | Remove recipient |
| POST | `/api/alerts/test` | Send test alert |
| GET | `/api/dashboard/summary` | Dashboard KPIs |
| GET | `/api/dashboard/detections` | 7-day detection chart |
| GET | `/api/stream/mjpeg` | MJPEG camera stream |
| WS | `/ws/detections?cam=01` | Live detection boxes |
| GET | `/api/health` | Health check |

## Camera Options

### Option A (default — implemented)
Backend opens the local webcam directly. Frontend displays the MJPEG stream from `/api/stream/mjpeg`. Simple, but camera must be on the same machine as the backend.

### Option B (not implemented — for future use)
Frontend keeps `getUserMedia()` and periodically POSTs frames to a `/api/recognize` endpoint. Useful when the camera is on a different machine than the server.

## Known Limitations & Architecture

### Face Recognition Setup & Fallback Mode
*   **Manual Install Required:** The dlib-based `face_recognition` library requires cmake and Visual Studio Build Tools to compile on Windows. If skipped, the backend will silently fall back to OpenCV's Haar Cascade.
*   **Fallback Mode Limitation:** In Haar Cascade fallback mode, **identity recognition is disabled**. Faces can be detected but will always be classified as `"Unknown"` with `0.0%` confidence.
*   **Needs Re-enrollment Badge:** Staff profiles enrolled during fallback mode will have `null` face embeddings. The frontend displays a **"Needs Re-enrollment"** badge on these profiles. Once `face_recognition` is active, their photos must be re-submitted.

### Alerting & Hardware Stubs
*   **WhatsApp alerts:** Requires Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_WHATSAPP`) in `.env`. If not set, WhatsApp alerts are skipped and logged as warnings without crashing the system.
*   **Siren channel:** Currently plays a synchronous machine beep (`winsound.Beep`) on Windows systems and logs warnings on Linux/macOS. Exception-safe and does not block/crash alert execution.
*   **Door Lock channel:** Implemented as a log-only stub.
*   **Future hardware integration:** Real physical locks/sirens will require replacing these stubs with relay controller integrations (e.g. Serial/GPIO).

### Store Status Flow (Backend-Computed)
*   Historically calculated locally on the client, the store status is now computed server-side to prevent client clock-drift issues.
*   **API Endpoint:** `GET /api/status` returns the backend's current status (`"open" | "closed" | "override"`), `storeOpen` boolean, `overrideActive` boolean, and the computed `todayHours` payload.
*   The frontend polls this endpoint on a 15-second interval and updates the top-bar badge, ensuring absolute synchronization with backend rule execution.

