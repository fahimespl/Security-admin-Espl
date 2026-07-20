# Fix Prompt — Aurelia Guard (Post-Audit Cleanup)

**Context:** Based on `AUDIT_REPORT.md`, most of the system is verified working. This prompt covers the **one remaining architectural fix** plus some cleanup/documentation items. Face recognition (dlib install) is being handled manually by me — don't attempt to install it yourself. WhatsApp real-sending and real siren/lock hardware are intentionally deferred — do not attempt to implement these, just keep them as clean, documented stubs.

---

## 📋 THE PROMPT (copy everything below this line to your AI agent)

Based on `AUDIT_REPORT.md`, please fix the following issues in the Aurelia Guard codebase. Do NOT attempt to install `dlib`/`face_recognition` — that's being handled manually. Do NOT implement real WhatsApp sending or real hardware (GPIO/relay) integration — leave those as stubs, just make sure they fail gracefully and are clearly documented as such.

### Fix 1 (Primary): Move Store Status Calculation to the Backend

**Problem (from audit Section 6):** `store-provider.tsx` currently recalculates `storeOpen` and `overrideActive` on the client using the browser's local clock. This can drift from the backend's actual rule-engine decision if the client device's clock is wrong, or if settings change but the client hasn't refreshed.

**Required changes:**
1. In the backend, add a `status` field to the `GET /api/dashboard/summary` response: `"open" | "closed" | "override"`, computed server-side using the same logic already implemented in `rule_engine.py` (the store-hours + maintenance-window logic that's already verified correct).
2. Also expose this same status via a lightweight dedicated endpoint, e.g. `GET /api/status`, so the frontend can poll it independently of the full dashboard summary (avoids over-fetching just to get the badge state).
3. In `store-provider.tsx`, remove the client-side `useMemo` calculation of `storeOpen`/`overrideActive` from the local clock, and instead:
   - Fetch `/api/status` on an interval (e.g. every 15-30 seconds) using SWR with `refreshInterval`
   - Derive `storeStatus`, `storeOpen`, and `overrideActive` directly from that response
   - Keep the `now`/live-clock display for the top-bar clock itself (that's fine to stay client-side, it's just a visual clock, not a decision input) — but the OPEN/CLOSED/OVERRIDE badge and any logic gating (like whether Live View shows "would alert" preview text) must use the backend-derived status, not the client-calculated one.
4. Confirm no other component still imports or relies on the old client-side calculation.

**Verification after the fix:**
- Change the system clock only on the client browser's machine (not the server) — confirm the badge does NOT change, since it should now come from the backend
- Change store hours via the Hours & Rules page — confirm the badge updates within one polling interval
- Enable maintenance override — confirm badge shows "Override" and matches backend's `maintenance_active` value

### Fix 2: Re-enrollment Safety Net for Existing Staff

**Problem:** Staff enrolled while the Haar Cascade fallback was active have `embedding = null` in the database. Once real `face_recognition` is installed (I'm handling this manually), those old records will silently fail to match against anyone.

**Required changes:**
1. Add a simple visual indicator in the Staff Management page/table — e.g. a small warning badge/icon next to any staff row where `embedding` is null — labeled something like "Needs Re-enrollment" or "No Face Data"
2. This is read-only detection, no new enrollment flow needed — just surface the existing `null` embedding state so it's visible instead of silently failing later
3. Add this same check as a note in the backend README so future setup doesn't repeat the same silent gap

### Fix 3: Confirm Alert Dispatch Stubs Fail Gracefully (No New Functionality)

**Problem:** Not a bug per the audit, but confirm robustness before considering this "done" for now.

**Required changes (verification only, minimal/no code changes expected):**
1. Confirm `POST /api/alerts/test` and the real detection-triggered alert path both handle a missing Twilio config the same way (skip + log a clear warning), not just the test endpoint
2. Confirm the siren stub (`winsound`) doesn't crash the whole alert dispatch flow on non-Windows — it should catch the platform mismatch and log a warning, not throw an unhandled exception
3. If either of these isn't already true, fix just enough to make them fail gracefully — do not build out the real integrations

### Fix 4: Documentation Pass

Update `backend/README.md` (or add a new `KNOWN_LIMITATIONS.md` if cleaner) to clearly state, in one place:
- Face recognition requires manual `dlib` install (link to install instructions); until then, system runs in detection-only mode
- WhatsApp requires Twilio credentials in `.env`; currently unconfigured by design for this phase
- Siren/lock are software stubs; real hardware integration is a future phase
- Store status is now backend-computed and polled by the frontend (document the new `/api/status` endpoint)

### What NOT to do in this pass
- Do not install or attempt to fix `dlib`/`face_recognition`
- Do not add real Twilio credentials or attempt a live WhatsApp send
- Do not implement GPIO/relay/hardware code
- Do not add authentication (still deferred)
- Do not restructure pages/components beyond what Fix 1 and Fix 2 require

### Deliverable
After these fixes, re-run the same audit checklist from `AUDIT_REPORT.md` Section 6 and Section 9, and update the summary table to reflect the new state — the "Client-side Status Calculation Duplication" ⚠️ should now be ✅, and Staff CRUD should note the new re-enrollment indicator.

---

## 🔍 Notes for You (Fahim)

- Run **Part A (manual dlib install)** yourself, separately from this prompt, whenever convenient — it's not blocking the rest of the fixes.
- Once both are done, you'll have a genuinely clean system except for: WhatsApp (needs your Twilio setup), and real siren/lock hardware (needs physical wiring at the store) — both correctly deferred, not bugs.
- After this, your system is realistically at the point where the next milestone is **behavioral testing at the actual store premises** rather than more code work.
