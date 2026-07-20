# Codebase Audit — Missing & Must-Have Features

## 🔴 Critical — Broken or Missing Core Functionality

---

### 1. Snapshots never saved to detection logs
**Where:** [camera.py](file:///c:/Users/fahim/Desktop/Security_ESPL/backend/cv/camera.py) + [stream.py](file:///c:/Users/fahim/Desktop/Security_ESPL/backend/routers/stream.py) + [rule_engine.py](file:///c:/Users/fahim/Desktop/Security_ESPL/backend/services/rule_engine.py)

The DB model has a `snapshot_path` column. The logs UI has a "Snapshot placeholder" box. But **no code ever saves a snapshot**. When `process_detection()` creates a `LogEntry`, `snapshot_path` is always `None`. The alert dispatcher accepts a `snapshot_url` param but it's passed as `None` everywhere.

**Impact:** The WhatsApp alert message never includes a photo of the intruder. The log detail modal always shows "Snapshot placeholder". The whole snapshot feature is wired up but never activated.

**Fix needed:** In `process-frame` endpoint, when a face is detected and an alert fires, save the JPEG frame to Supabase Storage (or local disk) and store the URL in `snapshot_path`. Pass it to `dispatch_alert()` as `snapshot_url`.

---

### 2. Log limit is hard-coded to 200
**Where:** [logs.py](file:///c:/Users/fahim/Desktop/Security_ESPL/backend/routers/logs.py#L50)

```python
rows = q.order_by(LogEntryModel.timestamp.desc()).limit(200).all()
```

After 200 detections the API silently drops older events. A busy store could hit this in an hour. There's no pagination — the frontend just shows whatever the API returns. Old alerts and evidence will disappear from the UI.

**Fix needed:** Add `?page=` / `?limit=` query params to the logs endpoint and paginate the frontend table.

---

### 3. Cooldown tracker is in-memory (lost on restart)
**Where:** [rule_engine.py](file:///c:/Users/fahim/Desktop/Security_ESPL/backend/services/rule_engine.py#L22)

```python
_cooldown_tracker: dict[str, datetime] = {}
```

Every time the backend restarts (which happens on every Render redeploy), the cooldown resets. This means right after a redeploy, **all cooldowns are gone** — the same intruder could trigger a flood of duplicate alerts in the first 30 seconds.

**Fix needed:** Store the last-alert timestamp in the DB (one row per identity key) instead of in memory.

---

### 4. No authentication / access control
**Where:** Entire backend

Any URL that knows the API base URL can:
- Read all logs
- Add/delete staff members
- Change all settings
- Trigger test alerts

There is zero authentication. On production, anyone who finds the backend URL has full admin access.

**Fix needed:** Add API key authentication or JWT-based auth. At minimum, add a `BACKEND_API_SECRET` env var and require it in an `Authorization` header for all mutation endpoints.

---

## 🟡 Important — Significantly Degrades Functionality

---

### 5. Detections chart only shows 7 days; no hourly view
**Where:** [dashboard.py](file:///c:/Users/fahim/Desktop/Security_ESPL/backend/routers/dashboard.py#L104) + [detections-chart.tsx](file:///c:/Users/fahim/Desktop/Security_ESPL/frontend/components/dashboard/detections-chart.tsx)

The chart is fixed at 7 days, and the data is bucketed by day — you can't see **when during the day** most intrusions happen. For a security system, an hourly breakdown is much more actionable ("all incidents happen between 2–4am").

**Fix needed:** Add a time-range selector (Today / 7d / 30d) and an hourly view for the current day.

---

### 6. Face recognition confidence threshold is ignored on the boundary
**Where:** [rule_engine.py](file:///c:/Users/fahim/Desktop/Security_ESPL/backend/services/rule_engine.py#L127)

The rule engine currently alerts on **ANY** face during closed hours, regardless of whether it's known or unknown:
```python
if not store_open and not maintenance_active:
    if check_cooldown(identity_key, settings.rules.cooldown_seconds):
        should_alert = True
```

This means a **known staff member** (manager doing late-night stocktake) will trigger an alert. The UI implies "Unknown faces trigger alerts" but the code alerts on everyone.

**Fix needed:** Add a settings option: "Alert on unknown faces only" vs "Alert on all faces" during closed hours.

---

### 7. Bell icon clears alerts instead of showing them
**Where:** [dashboard-shell.tsx](file:///c:/Users/fahim/Desktop/Security_ESPL/frontend/components/dashboard-shell.tsx#L180)

```tsx
<button onClick={clearAlerts} ...>
  <Bell />
  {unreadAlerts > 0 ? <span>{unreadAlerts}</span> : null}
</button>
```

Clicking the bell **clears the unread count** instead of opening a notification panel or navigating to the Logs page. The user has no way to see *what* the alerts were without manually navigating to Logs.

**Fix needed:** Clicking the bell should open a dropdown/panel showing the last 5 alerts, with a "View all" link to `/logs`.

---

### 8. No export for logs
**Where:** [logs-view.tsx](file:///c:/Users/fahim/Desktop/Security_ESPL/frontend/components/logs/logs-view.tsx)

For a security system, the owner will need to share log reports with police or management. There's no way to export the log data.

**Fix needed:** Add a "Export CSV" button that downloads the filtered logs as a CSV file.

---

### 9. No staff photo re-enrollment flow
**Where:** [staff-form.tsx](file:///c:/Users/fahim/Desktop/Security_ESPL/frontend/components/staff/staff-form.tsx)

If a staff member's face embedding fails (bad photo, no face detected), the card shows a "Needs Re-enrollment" badge. But there's no dedicated button or flow to capture a new photo specifically for re-enrollment — the user has to open "Edit", re-upload, and hope the embedding computes this time. There's also no feedback showing **whether the face was actually detected** in the uploaded photo.

**Fix needed:** When creating/editing staff, after photo upload, call a `/api/staff/check-face` endpoint that returns whether a face was detected. Show a ✅ or ❌ indicator immediately so the user knows if the photo is usable.

---

## 🟢 Nice-to-Have — Would Significantly Improve the Product

---

### 10. Dashboard summary cards use client-side data, not the backend `/api/dashboard/summary`
**Where:** [summary-cards.tsx](file:///c:/Users/fahim/Desktop/Security_ESPL/frontend/components/dashboard/summary-cards.tsx)

The backend has a purpose-built `/api/dashboard/summary` endpoint returning `totalStaff`, `activeStaff`, `todayDetections`, `todayAlerts`. But the frontend ignores it and re-computes these stats from the `logs[]` array (which is limited to 200 entries and may be stale). The dashboard KPIs can be wrong.

**Fix needed:** `SummaryCards` should fetch from `/api/dashboard/summary` directly.

---

### 11. Logs page filters are client-side only
**Where:** [logs-view.tsx](file:///c:/Users/fahim/Desktop/Security_ESPL/frontend/components/logs/logs-view.tsx#L23)

The date range, known/unknown, and store status filters all filter the already-fetched 200 logs in JavaScript. If you filter for "last month" and there are >200 logs total, you'll see an incomplete dataset.

**Fix needed:** Make filters send query params to `/api/logs?from=&to=&known=&action=` (the backend already supports these parameters).

---

### 12. No multi-camera support
**Where:** [stream.py](file:///c:/Users/fahim/Desktop/Security_ESPL/backend/routers/stream.py), [live-view.tsx](file:///c:/Users/fahim/Desktop/Security_ESPL/frontend/components/live/live-view.tsx)

The live view is hardcoded as "CAM 01 · Entrance". For a jewellery store you'd want at minimum 2–3 cameras (entrance, display cases, safe). The WebSocket endpoint already accepts `?cam=01` but only returns one global `latest_boxes`.

**Fix needed:** Support multiple simultaneous browser streams, each as a separate tab or grid tile.

---

### 13. No face detected feedback when uploading staff photo
**Where:** [staff-form.tsx](file:///c:/Users/fahim/Desktop/Security_ESPL/frontend/components/staff/staff-form.tsx)

The photo is uploaded and the backend silently tries to compute an embedding. If no face is found, `face_embedding` is `NULL` and the staff member gets a "Needs Re-enrollment" badge — but only after saving. The user gets no real-time feedback before pressing "Add staff".

---

### 14. WhatsApp alert format has no snapshot image
**Where:** [alert_dispatcher.py](file:///c:/Users/fahim/Desktop/Security_ESPL/backend/services/alert_dispatcher.py#L111)

The WhatsApp message is text-only. The `media_url` param is supported by the Twilio call but always passed as `None` from `dispatch_alert()`. Combined with fix #1 (saving snapshots), the WhatsApp message should include the intruder's face photo for immediate recognition.

---

## Summary Table

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | Snapshots never saved or sent | 🔴 Critical | Medium |
| 2 | Log limit hard-coded to 200 | 🔴 Critical | Small |
| 3 | Cooldown lost on restart | 🔴 Critical | Small |
| 4 | No authentication | 🔴 Critical | Large |
| 5 | Chart only 7 days, no hourly | 🟡 Important | Medium |
| 6 | Known staff still trigger alerts | 🟡 Important | Small |
| 7 | Bell clears instead of shows alerts | 🟡 Important | Small |
| 8 | No log export (CSV) | 🟡 Important | Small |
| 9 | No face-detected feedback on upload | 🟡 Important | Small |
| 10 | Dashboard KPIs use wrong data source | 🟢 Nice-to-have | Small |
| 11 | Log filters are client-side only | 🟢 Nice-to-have | Small |
| 12 | No multi-camera support | 🟢 Nice-to-have | Large |
| 13 | No real-time face check on upload | 🟢 Nice-to-have | Small |
| 14 | WhatsApp has no intruder photo | 🟢 Nice-to-have | Small (after #1) |
