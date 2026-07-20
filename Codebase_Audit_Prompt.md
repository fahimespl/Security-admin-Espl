# Codebase Audit Prompt — Aurelia Guard (End-to-End Verification)

**Purpose:** Give this to your AI coding agent (Claude Code recommended, since it needs to read and run real code across both `backend/` and the Next.js frontend). The goal is a **real, evidence-based audit** — not a summary of file names, but proof that each feature actually works.

**Important instruction to include for the agent:** Do not report something as "done" or "working" just because a file exists or the code compiles. Actually read the implementation logic, and where possible, run it (start the servers, hit the endpoints, check the database) to confirm real behavior. If something cannot be verified without live hardware (camera/WhatsApp), say so explicitly rather than assuming it works.

---

## 📋 THE PROMPT (copy everything below this line to your AI agent)

I need a complete, honest, end-to-end audit of my jewelry-store security system codebase — **Aurelia Guard** — covering both the FastAPI backend (`backend/`) and the Next.js frontend. I want to know exactly what is actually built and working versus what is missing, stubbed, mocked, or broken. Do not trust file existence or successful compilation as proof of correctness — read the actual logic and, where feasible, run the system to verify real behavior.

Produce your findings as a structured markdown report titled `AUDIT_REPORT.md` with the exact sections below. For every single item, mark it using this scale:

- ✅ **Working** — verified by reading logic AND (where applicable) running it
- ⚠️ **Partial** — exists but incomplete, stubbed, or has a bug
- ❌ **Missing** — not implemented at all
- ❓ **Unverifiable** — requires live hardware/credentials you don't have (say what's needed to verify)

For every ⚠️ or ❌, include: the file/location, what's wrong or missing, and a one-line suggested fix.

---

### SECTION 1: Environment & Setup Sanity Check
- Does the backend actually start without errors (`uvicorn main:app --reload`)?
- Does the frontend actually start without errors (`npm run dev`)?
- Do both `.env` / `.env.local` files exist with the expected variables filled in (not placeholder values)?
- Does the database file get created on first run, with all expected tables?
- **Critical check:** On backend startup, does it log which face-recognition mode loaded — real `face_recognition`/dlib, or the Haar cascade fallback? State clearly which one is actually active right now.

### SECTION 2: Backend API — Verify Each Endpoint Actually Works
For each endpoint below, actually call it (via curl/httpie/test client) and report the real response, not just "endpoint exists":

| Endpoint | What to verify |
|---|---|
| `GET /api/staff` | Returns actual seeded/created staff, correct shape (camelCase, matches frontend types) |
| `POST /api/staff` | Upload a real test photo — confirm a face embedding is actually computed and stored (not null/empty) |
| `PATCH /api/staff/{id}` | Update actually persists in the database |
| `DELETE /api/staff/{id}` | Staff and their embedding are actually removed |
| `GET /api/settings` | Returns real settings, correct nested shape |
| `PUT /api/settings` | Update actually persists |
| `GET /api/logs` | Returns real log entries; test each filter param actually filters correctly |
| `POST /api/recipients` / `DELETE` | Actually persists/removes |
| `POST /api/alerts/test` | Does this actually attempt to send WhatsApp/trigger siren/lock, or just return a fake success? Be explicit. |
| `GET /api/dashboard/summary` | Numbers reflect actual database state, not hardcoded |
| `GET /api/dashboard/detections` | Real 7-day data from actual logs, not mock array |
| `WS /ws/detections` | Actually connect and confirm real Box[] data streams (not static/frozen values) |

### SECTION 3: Face Recognition Pipeline — Real Verification
- Confirm whether `face_recognition`/dlib is actually installed and importable in the current environment, or if it's silently running on the Haar cascade fallback
- If real recognition is active: enroll a test face, then verify the system correctly identifies that same face as "Known" with a reasonable confidence score, and a different/random face as "Unknown"
- If only Haar cascade fallback is active: state clearly that **identity recognition is NOT functional**, only face presence detection is — this is a major gap if true
- Check whether bounding box coordinates are actually normalized 0-1 as designed, or in raw pixels (would break the frontend overlay)
- Confirm the webcam/camera actually opens successfully (`cv2.VideoCapture`) — report the exact behavior if it fails silently

### SECTION 4: Rule Engine — Verify Against the Original Specification
This is the most important section — verify actual behavior against these exact rules, not assumptions:

| Rule | How to verify | Status |
|---|---|---|
| Shop OPEN + any face detected → log only, no alert | Simulate open hours, trigger detection, confirm no alert fires |
| Shop CLOSED + unknown face → alert fires (WhatsApp/siren/lock all attempt) | Simulate closed hours with unknown face |
| Shop CLOSED + **known staff** face → alert STILL fires (per original spec — not just unknowns) | Simulate closed hours with known face — confirm this actually alerts, this was previously found buggy |
| Cooldown period respected — same identity doesn't re-alert within N seconds | Trigger repeated detections of same face, confirm suppression |
| Confidence threshold actually affects known/unknown classification | Change threshold value, confirm classification changes accordingly |
| Maintenance/override mode suppresses alerts during its window | Enable override, confirm no alert during window |
| Maintenance window crossing midnight (e.g. 22:00→05:00) handled correctly | Test with a window that spans midnight, confirm logic is correct both before and after midnight |
| Every alert or log-only decision writes a real LogEntry to the database | Confirm log entries appear in `/api/logs` after each test above |

### SECTION 5: Alert Dispatch — Real vs Stubbed
- **WhatsApp:** Is this actually calling a real WhatsApp/Twilio API with real credentials, or just logging/pretending? If real, was a message actually confirmed received on a test phone? If not tested, say so explicitly.
- **Siren:** Does it actually play a sound on the machine, or just log a message? Note the OS-dependency (e.g. if using `winsound`, confirm this only works on Windows and will silently fail/error on other platforms)
- **Auto-lock:** Confirmed stub only (no real hardware yet) — is this clearly documented as a stub, and does it fail gracefully?
- Confirm the three channels are genuinely independent — deliberately break one (e.g. invalid WhatsApp credentials) and confirm the other two still fire

### SECTION 6: Frontend Integration — Real Data, Not Mock
- Confirm `lib/mock-data.ts` is no longer imported or used anywhere in the active code path (search the whole codebase for any remaining references)
- For each page, confirm data is coming from the real API (not cached mock state left over from before):
  - Dashboard — KPI numbers and chart reflect real backend data
  - Staff — list reflects real database records; add/edit/delete actually round-trip to backend
  - Hours & Rules — changes actually persist to backend and are re-read on refresh (not lost on reload)
  - Alerts — recipient list and channel toggles persist to backend
  - Logs — table shows real logged events, filters call backend correctly
  - Live View — video stream and bounding boxes come from the real WebSocket/MJPEG stream, not any leftover mock jitter code
- Confirm the top-bar store OPEN/CLOSED/OVERRIDE badge reflects real backend-computed status, not frontend-only calculation (or if it's still frontend-calculated, flag this as a duplication risk vs the backend's own rule engine)

### SECTION 7: Data Persistence Verification
- Restart the backend server — confirm staff, settings, and logs all survive the restart (proving real persistence, not in-memory)
- Refresh the frontend — confirm no data reverts to mock/default values

### SECTION 8: Known Gaps From Project History (Explicitly Check These)
These were flagged as risks in earlier planning — confirm current status of each:
1. Authentication/login — confirmed still not implemented (expected, deferred by design) — just confirm no broken/partial auth code lying around causing issues
2. Multi-camera support — confirmed single camera only (expected at this stage)
3. Cross-platform siren (winsound is Windows-only) — confirm this limitation is documented somewhere in the repo (README or code comment)
4. Real hardware for lock/siren — confirmed still simulated/stubbed as expected

### SECTION 9: Overall Summary Table
Produce a final summary table with one row per major feature area (Setup, Staff CRUD, Settings, Logs, Face Detection, Face Recognition, Rule Engine, Alerts, Live Streaming, Data Persistence) and its overall status (✅/⚠️/❌/❓), with a total count of each at the bottom.

### SECTION 10: Prioritized Fix List
Based on everything found above, give me a prioritized list (not just a dump) of what to fix first, ordered by: (1) things that are completely broken and block core functionality, (2) things that are partially working but risky, (3) nice-to-haves/documentation gaps. For each, estimate roughly how much work it is (quick fix / half a day / bigger task).

---

## 🔍 Notes for You (Fahim) Before Running This

- This audit requires the agent to actually **run** both servers and make real calls — make sure your backend `.env` has whatever test credentials it needs (even dummy/sandbox WhatsApp credentials) so the agent isn't blocked testing that section.
- If your AI agent can't access your physical webcam (common in sandboxed environments), it should mark Section 3's webcam-open check as ❓ Unverifiable and explain what you need to test manually yourself.
- Expect this to take a while to run properly — it's testing a real system, not just reading code. That's the point: a fast audit that only reads files would just repeat the same "structure looks good" summary you've already gotten twice.
- Once you get `AUDIT_REPORT.md` back, share it here — I can help you interpret the findings and turn Section 10 (prioritized fix list) into your next set of sprints.
