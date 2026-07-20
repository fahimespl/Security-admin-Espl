# Aurelia Guard — Frontend Build Report

A security & staff-monitoring admin panel for a jewelry store. This report documents
what has been built, the architecture, the feature set per page, and known limitations.

---

## 1. Overview

**Aurelia Guard** is a dark, CCTV/SaaS-style admin dashboard for managing jewelry-store
security. It covers live camera monitoring, facial-recognition-driven staff verification,
store-hours rule enforcement, alerting, and an audit log of detection events.

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + custom design tokens (`app/globals.css`)
- **Icons:** `lucide-react`
- **State:** Single shared React Context (`StoreProvider`) — no backend yet
- **Data:** In-memory mock data (`lib/mock-data.ts`), resets on refresh
- **Status:** Fully interactive frontend prototype, ready to wire to a real API

---

## 2. Design System

| Token | Purpose |
| --- | --- |
| Dark base surfaces | CCTV/control-room aesthetic |
| Cyan-blue brand accent | Primary actions, active nav |
| Green | "Safe" / authorized / store OPEN |
| Red | "Alert" / unauthorized / store CLOSED |
| Amber | "Warning" / attention states |

- **Typography:** Two families max — a sans for UI/body and a mono for timestamps/IDs.
- **Layout:** Mobile-first, flexbox-driven, responsive grids on larger screens.
- **Status color system** is consistent across every page (badges, cards, log rows,
  bounding boxes).

---

## 3. Architecture

```
app/
  layout.tsx            Root layout, fonts, providers (StoreProvider + Toaster)
  page.tsx              Dashboard overview
  live-view/page.tsx    Live camera view
  staff/page.tsx        Staff management
  hours-rules/page.tsx  Store hours & rules
  alerts/page.tsx       Alert settings
  logs/page.tsx         Logs & history

components/
  store-provider.tsx    Global mock state + derived store OPEN/CLOSED status
  dashboard-shell.tsx   Sidebar nav + top bar (wraps every page)
  page-header.tsx       Shared page title/description block
  toast.tsx             Toast notification system
  confirm-dialog.tsx    Reusable delete/confirm modal
  ui-kit.tsx            Card, Badge, Avatar, Switch, Modal, Slider primitives
  dashboard/            Summary cards, activity feed, detections chart
  staff/                Staff table/grid view + add/edit form modal
  hours/                Store hours + rules editor
  alerts/               Alert channel & threshold settings
  logs/                 Filterable log table + detail modal
  live/                 Webcam feed + canvas bounding-box overlay

lib/
  types.ts              Shared TypeScript types
  mock-data.ts          Seed data (staff, logs, hours, settings)
  format.ts             Date/time/number formatting helpers
```

**Key architectural decision:** All state lives in `StoreProvider`. This is the single
integration point — swapping mock state for real API calls later touches only this file.
Because state is shared, changes propagate live across the UI (e.g. adding staff updates
dashboard counts; changing hours flips the top-bar status badge).

---

## 4. Features by Page

### Dashboard (`/`)
- Summary cards: total staff, active alerts, today's detections, store status.
- Recent activity feed sourced from the shared log state.
- Detections chart visualizing recent event volume.
- Fully reactive to changes made on other pages.

### Live View (`/live-view`)
- Real webcam feed via `getUserMedia()`.
- `<canvas>` overlay drawing mock bounding boxes (green = authorized, red = unauthorized).
- "Test Mode" banner and a Test/Live mode toggle that feeds the rule-engine decision.
- Graceful handling when camera permission is denied.

### Staff Management (`/staff`)
- Searchable, role-filterable staff list (grid/table).
- Add/Edit modal with live photo preview and initials-based avatar fallback.
- Delete with confirmation dialog.
- Toast feedback on every create/update/delete.

### Store Hours & Rules (`/hours-rules`)
- Per-day open/close hour editor.
- Rule configuration for authorized-access windows.
- Editing hours updates the derived store OPEN/CLOSED badge in the top bar in real time.

### Alert Settings (`/alerts`)
- Toggle alert channels (e.g. in-app, email).
- Sensitivity/threshold sliders.
- Settings persisted in shared state for the session.

### Logs & History (`/logs`)
- 26 realistic seeded detection events.
- Working filters: date, recognition result, status.
- Row detail modal with full event metadata.

---

## 5. Shared UI Components

- **Dashboard shell:** persistent sidebar navigation + top bar with live clock and a
  derived store OPEN/CLOSED status badge.
- **Toast system:** transient notifications for user actions.
- **Confirm dialog:** reusable destructive-action confirmation.
- **UI kit:** Card, Badge, Avatar, Switch, Modal, Slider primitives for consistency.

---

## 6. What's Working

- All six pages render and navigate cleanly.
- Live cross-page state propagation via the shared context.
- Real webcam capture with canvas bounding-box overlays.
- Full CRUD on staff with validation, previews, and toasts.
- Working log filters and detail modal.
- Live top-bar clock and derived store-status badge.
- Consistent status-color system and responsive layouts throughout.

---

## 7. Known Limitations

- **No persistence:** all data is in-memory and resets on page refresh.
- **Mock "now":** the clock/store-status use a fixed mock time (2026-07-13, 2:32 PM)
  that ticks forward for a live feel.
- **No real recognition:** bounding boxes and detections are simulated, not from an
  actual ML model.
- **No auth:** the panel is open; no login/roles enforcement yet.

---

## 8. Next Steps (Backend Integration)

1. Wire `StoreProvider` to a real API (e.g. FastAPI) — replace mock state with fetched data.
2. Add a database for staff, logs, hours, and settings.
3. Connect a real facial-recognition service to feed detections and bounding boxes.
4. Add authentication and role-based access control.
5. Introduce real-time updates (WebSocket/SSE) for live detections and alerts.
