# End-to-End Backend Integration Prompt — Aurelia Guard

**Use this with Claude Code (recommended, since it's a multi-file, multi-service build) or paste sections into v0/another AI tool as needed.**

This prompt assumes the frontend (Next.js + React + TypeScript, "Aurelia Guard") already exists exactly as described in the frontend report — `StoreProvider`, `lib/types.ts`, and the 6 pages. The goal here is to build a **separate FastAPI backend** with **real OpenCV/face-recognition**, and wire the frontend to it over REST + WebSocket, with **no authentication yet**.

---

## 📋 THE PROMPT (copy everything below this line into Claude Code / your coding agent)

I have an existing Next.js + TypeScript frontend called **Aurelia Guard** — a jewelry store security admin panel. It currently runs entirely on mock data via a React Context (`components/store-provider.tsx`), with data shapes defined in `lib/types.ts`. I need you to build a **separate FastAPI backend** and wire the frontend to it, replacing all mock data with real persistence and real face detection/recognition. **No authentication in this phase.**

### 1. Backend Service Setup
- Create a new `backend/` folder (sibling to the Next.js app, not inside it) as an independent FastAPI project
- Use **Python 3.11+**, **FastAPI**, **Uvicorn** for the server
- Use **SQLite** for now via **SQLAlchemy** (with models structured so switching to PostgreSQL later only touches the connection string)
- Set up **CORS** so the Next.js frontend (running on a different port) can call it
- Provide a `requirements.txt` and a simple `run.sh` / instructions to start the server locally
- Project structure should be roughly:
  ```
  backend/
    main.py
    database.py
    models/           (SQLAlchemy models: Staff, LogEntry, Settings, AlertRecipient)
    schemas/          (Pydantic schemas matching lib/types.ts shapes exactly)
    routers/          (staff.py, settings.py, logs.py, alerts.py, dashboard.py, detections.py)
    services/         (face_recognition_service.py, rule_engine.py, alert_dispatcher.py)
    cv/               (camera capture, face detection/recognition logic)
    ws/               (WebSocket handler for live detections)
    storage/          (uploaded staff photos, captured snapshots)
  ```

### 2. Data Models & API Contracts
Match these **exactly** to the existing frontend TypeScript types so no frontend code needs to change shape-wise:

```python
# Staff
class StaffMember:
    id: str
    name: str
    role: Literal["Manager", "Sales", "Cleaner", "Security"]
    enrolled_on: str          # ISO date
    status: Literal["Active", "Inactive"]
    photo: Optional[str]      # stored image URL/path

# LogEntry
class LogEntry:
    id: str
    timestamp: str            # ISO datetime
    known: bool
    staff_name: Optional[str]
    store_open: bool
    action: Literal["Logged Only", "Alert Sent"]
    confidence: float         # 0-100

# AlertRecipient
class AlertRecipient:
    id: str
    name: str
    phone: str

# Settings (single row/document, no multi-tenant needed)
class Settings:
    system_mode: Literal["test", "live"]
    hours: {
        per_day: bool
        default: { open: str, close: str }     # HH:mm
        week: List[{ day: str, open: str, close: str, closed: bool }]
    }
    rules: {
        cooldown_seconds: int
        confidence_threshold: float    # 0-100
        maintenance_mode: bool
        maintenance_start: str         # HH:mm
        maintenance_end: str           # HH:mm
    }
    channels: { whatsapp: bool, siren: bool, auto_lock: bool }
    recipients: List[AlertRecipient]
```

Implement these REST endpoints (mirror the frontend report's §5 table exactly):

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/staff` | list all staff |
| POST | `/api/staff` (multipart: fields + face photo) | enroll new staff — **compute and store the face embedding here** |
| PATCH | `/api/staff/{id}` | update staff |
| DELETE | `/api/staff/{id}` | remove staff (and their embedding) |
| GET | `/api/settings` | fetch current settings |
| PUT | `/api/settings` | update settings |
| GET | `/api/logs?from=&to=&known=&action=` | fetch filtered logs |
| POST | `/api/recipients` | add alert recipient |
| DELETE | `/api/recipients/{id}` | remove alert recipient |
| POST | `/api/alerts/test` | send a real test alert through enabled channels |
| GET | `/api/dashboard/summary` | KPI counts for dashboard cards |
| GET | `/api/dashboard/detections` | detections-per-day data for the chart |
| WS | `/ws/detections?cam=01` | live stream of detected face boxes (see §4) |

### 3. Face Detection & Recognition Pipeline
- Use **OpenCV** to capture frames from a camera source (start with the server's own webcam device index `0` for local testing, or accept an uploaded/streamed frame from the browser — see options below)
- Use the **`face_recognition`** library (dlib-based) for face detection + embeddings — simplest to set up and matches the earlier project plan. (If accuracy is a problem later, this can be swapped for InsightFace without changing the API contract.)
- On staff enrollment: detect the face in the uploaded photo, compute its embedding, store the embedding (not just the raw photo) in the database alongside the photo
- On each captured frame during live detection:
  1. Detect all faces in frame
  2. For each face, compute embedding and compare against all enrolled staff embeddings
  3. If best match distance is within `confidence_threshold` (convert your library's distance metric to a 0-100 confidence score), label as **known** with the matched staff name; otherwise **unknown**
  4. Return bounding boxes in **normalized 0-1 coordinates** (relative to frame width/height) so the existing frontend overlay renderer works unchanged:
     ```python
     class Box:
         id: str
         name: str          # matched staff name or "Unknown"
         confidence: float  # 0-100
         x: float; y: float; w: float; h: float   # all 0..1
     ```

**Camera source — implement Option A first (simpler), leave Option B as a documented alternative:**
- **Option A (start here):** Backend directly opens the local webcam via OpenCV (`cv2.VideoCapture(0)`) and runs detection server-side in a background loop; frontend's `<video>` element switches from `getUserMedia()` to displaying an MJPEG stream endpoint (e.g. `GET /api/stream/mjpeg`) from the backend.
- **Option B (document only, don't build unless asked):** Frontend keeps `getUserMedia()` for the video preview, captures frames periodically, and POSTs them to `/api/recognize` for processing — useful if the store's camera is physically connected to the user's machine, not the server.

### 4. Real-Time Detection Delivery (WebSocket)
- Implement `WS /ws/detections?cam=01` that pushes a `Box[]` array to connected clients whenever new detections are computed (e.g. every 200-500ms, tune for smoothness vs. CPU load)
- On the frontend, replace the existing mock jitter `setInterval` in `components/live/live-view.tsx` with a WebSocket subscription (the report already shows the intended replacement code — use that pattern)

### 5. Server-Side Rule Engine
Move all decision logic from the frontend into the backend, since it must survive page reloads and be the actual source of truth:
- Apply `confidence_threshold` from Settings to classify known/unknown (don't hardcode it)
- Apply `cooldown_seconds` — track last-alerted timestamp per identity (or per "unknown" bucket) and suppress repeat alerts within that window
- Compute `store_open` from current server time vs. `settings.hours` (handle per-day hours and default hours)
- Compute `maintenance_active` from `settings.rules.maintenance_mode` + `maintenance_start`/`maintenance_end` — **must correctly handle windows that wrap past midnight** (e.g. 22:00 → 05:00), matching the frontend's existing logic
- Alert rule: trigger an alert when a face is detected (known **or** unknown, per the original spec — closed hours alert on ANY presence) AND store is closed AND maintenance is not active AND cooldown has elapsed for that identity
- On every detection decision (alert or log-only), **write a `LogEntry`** to the database so it shows up in Logs & Dashboard

> ⚠️ Note: earlier testing found the previous mock rule only alerted on unknown-during-closed. Please implement the **original spec** — during closed hours, alert on ANY detected face (known staff included) — and make this configurable-in-code but on-by-default, since we may want an "ignore known staff after hours" toggle later.

### 6. Alert Dispatch
- **WhatsApp:** integrate WhatsApp Cloud API (or Twilio sandbox) — send message with timestamp, known/unknown status, staff name if known, and attach/link the captured snapshot image, to all entries in `settings.recipients`
- **Siren:** for now (no real hardware), trigger a local sound file playback on the backend server as a stand-in; structure this as a swappable function (`trigger_siren()`) so it's trivial to replace with a GPIO/relay call later
- **Auto-Lock:** same approach — a stand-in function (`trigger_door_lock()`) that just logs the action for now, structured to be replaced with real hardware integration later
- Ensure these three actions are **independent** — if the WhatsApp API call fails (e.g. no internet), siren and lock actions should still fire, and the failed WhatsApp send should be logged for retry rather than blocking the others

### 7. Frontend Wiring
- In `components/store-provider.tsx`: replace the in-memory mock state with real data fetched from the FastAPI backend
  - Use **SWR** for all `GET` requests (staff, settings, logs, dashboard summary/chart) for caching + revalidation
  - Replace each mutation (`addStaff`, `updateStaff`, `deleteStaff`, `setSettings`, `addRecipient`, `removeRecipient`) with the matching `fetch` call to the backend, then revalidate the relevant SWR cache
  - Keep the exposed `useStore()` hook signature **identical** so no page components need to change
- In `components/live/live-view.tsx`: replace mock box generation with the WebSocket subscription described in §4, and switch the video source per the camera option chosen in §3
- Remove `lib/mock-data.ts` usage once the backend is confirmed working (keep the file for reference/tests, but stop importing it into the provider)
- Add a `.env.local` for the frontend with `NEXT_PUBLIC_API_BASE` and `NEXT_PUBLIC_WS_BASE` pointing at the FastAPI server

### 8. What NOT to Include in This Phase
- No authentication/login (explicitly deferred)
- No cloud deployment — local-only for now (backend runs on `localhost:8000`, frontend on `localhost:3000`)
- No multi-camera support yet — single camera (`cam=01`) is enough for this phase
- Don't remove or restructure any existing frontend pages/components beyond what's needed for the data-source swap

### 9. Deliverables Expected
1. Working FastAPI backend in `backend/` with all endpoints from §2, runnable via `uvicorn main:app --reload`
2. SQLite database auto-created on first run with the schema from §2
3. Real face enrollment (staff photo → embedding stored) and real live detection replacing all mock boxes
4. Frontend fully wired to the backend — no more `lib/mock-data.ts` driving the UI
5. A short `backend/README.md` covering: how to install dependencies, how to run the server, how to point the frontend at it, and known limitations (e.g. single camera, no auth yet)
6. Confirm the end-to-end flow works: enroll a staff member through the UI → their face is recognized live → simulate closed hours → detection triggers a real WhatsApp message + siren sound + lock log entry → event appears in Logs

---

## 🔍 Notes for You (Fahim) Before Running This

- This is a **big prompt** — if you're using Claude Code, it can handle it as one multi-step task since it can create/edit many files across a real project. If you're using v0 or a single-shot tool, you'll likely need to split it into the 9 sections above and feed them one at a time.
- You'll need **actual WhatsApp Cloud API or Twilio credentials** before §6 can be tested end-to-end — get a sandbox account first so the agent doesn't stall waiting for real secrets.
- Test **Option A (server-side webcam + MJPEG stream)** first since it's simpler; only bother with Option B if you eventually run the backend on a different machine than the one with the camera.
- Once this works, your **next natural gap** is authentication — worth planning as its own follow-up prompt rather than bundling in here.
