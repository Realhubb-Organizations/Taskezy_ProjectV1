# TASKEZY — Implementation Log

This file is the running source of truth for **what has actually been built**, as opposed to `ARCHITECTURAL_BLUEPRINT.md` (target design) and `SDLC_MANUAL.md` (process/timeline).

**Rule going forward: every work session ends with a new dated entry appended to the bottom of the "Log" section below, before ending the session.** Read this file first at the start of any new session to know exactly where the project stands.

---

## Current Stack

- Next.js 14.2.3 (App Router), React 18, TypeScript
- Tailwind CSS
- `lucide-react` for icons
- No backend/database connected yet — all data is local/mocked (frontend-only prototype stage)
- No auth provider wired up yet — `src/app/auth/login` is a UI shell
- No payment/provisioning backend wired up yet — `src/app/checkout` and `src/app/provisioning` are UI shells

## Reference Docs

- `ARCHITECTURAL_BLUEPRINT.md` — target SRS/architecture (PostgreSQL, multi-tenant, OAuth 2.0, AWS, Capacitor mobile). Describes the end-state, not current code.
- `SDLC_MANUAL.md` — process model and MVP timeline (target MVP: Oct 31, 2026).
- `credentials.md` — local credentials/secrets reference (not committed contents should be verified before sharing).

## Current State Snapshot (as of 2026-07-14)

### Pages (`src/app`)
- `page.tsx`, `layout.tsx`, `globals.css` — root app shell (recently modified)
- `auth/login/page.tsx` — login screen UI
- `checkout/page.tsx` — checkout/pricing flow UI
- `provisioning/page.tsx` — SaaS tenant provisioning flow UI
- `dashboard/layout.tsx` + `dashboard/page.tsx` — dashboard shell
- `dashboard/crm/page.tsx` — CRM module page
- `dashboard/hrms/page.tsx` — HRMS module page
- `dashboard/finance/page.tsx` — Finance module page
- `dashboard/properties/page.tsx`
- `dashboard/reports/page.tsx`
- `dashboard/resale/page.tsx`
- `dashboard/organization/page.tsx`
- `dashboard/settings/page.tsx`
- `dashboard/admin/page.tsx`

### Components (`src/components`)
- `dashboard/KpiGrid.tsx`, `SubActionsMenu.tsx`, `SalesTelemetry.tsx`, `AttendanceWidget.tsx`, `MarketingOperations.tsx`, `FinanceAudit.tsx`, `NotificationBell.tsx`
- `crm/LeadFilterBar.tsx`, `LeadTable.tsx`, `AddLeadModal.tsx`, `LeadDetailDrawer.tsx`, `TopMetricsCards.tsx`, `LeadDashboard.tsx`

### Reports system
- `src/lib/reportMetrics.ts` (new) — shared metric helpers used by all three report sections: `filterLeadsByRange`/`filterAdSpendByRange` (date filtering by `assignedAt`/ad-spend `date`), `computeCPL`, `computeLeadQuality` (buyer vs non-buyer status classification), `computeBookingValue`/`computeBookingCount`, `computeROIMultiple`, `computeAllocatedSpend` (spend attributed to an entity proportional to its share of lead volume in range), and SLA helpers `getMissedInfo`/`isMissedLead` (20-minute response-time rule). Also holds `SALES_HIERARCHY` — a name-based agent→manager map (not stored on `User`) because some agent names appearing in lead data (`Santhosh Reddy B`) don't have a matching seeded user record; mapping by name kept manager roll-ups correct despite that mock-data gap.
- `AppContext.tsx` data-layer additions to support this: `Lead` gained `assignedAt`/`firstResponseAt`/`reassignedAt`/`previousAgent` for SLA tracking; a new `AdSpendRecord` type + `adSpendRecords` state (seeded Meta/Google daily spend across 2026-07-01 to 2026-07-14, tied to campaign names and properties that match the existing mock lead data so joins actually resolve); a new `reassignLead(leadId, newAgent)` action that restarts a lead's SLA clock and logs the change; `addLead` now stamps `assignedAt`; `updateLeadStatus` now stamps `firstResponseAt` on first change and pushes a log entry (previously it silently mutated status with no audit trail).
- `src/app/dashboard/reports/page.tsx` rebuilt as an orchestrator: 3 top-level tabs (Marketing / Manager / Sales Agent Reports, via `?tab=`) plus one shared `DateRangeFilter` (`src/components/reports/DateRangeFilter.tsx`, with Last 7/14/30 Days and All Time presets) that all three sections consume — "all report generation is per the selected calendar date" is enforced by every section filtering off the same `dateRange` prop.
- `src/components/reports/MarketingReports.tsx` — summary cards (Total Spend, CPL, Lead Quality %, Booking-Based ROI), then 3 sub-tabs: **By Ad Account** (per-account CPL/quality/ROI, CRM leads joined to ad accounts by matching `lead.campaign` to the ad account name), **Overall** (spend-by-platform bars + buyer/non-buyer quality breakdown), **Property-wise** (spend/CPL/bookings/ROI grouped by `lead.property`).
- `src/components/reports/ManagerReports.tsx` — one row per sales manager/TL with Individual Leads, Team Leads, Total, Allocated Spend, ROI, **Missed (Self)** and **Missed (Team)** counts, expandable to a per-team-member missed-lead breakdown.
- `src/components/reports/AgentReports.tsx` — agent picker + per-agent metrics (leads, allocated spend, ROI, missed count) and a full missed-leads detail table (lead, assigned-at timestamp, wait time, latest log/notes, reassigned-at). Admins get a **Reassign** action per missed lead that calls `reassignLead` — makes the report directly actionable, not just read-only numbers.
- Decisions made (and why): CPL uses the ad platform's own `leadsGenerated` count (matches how marketing teams actually report CPL) while Lead Quality/ROI use CRM-tracked `leads` (the source of truth for what actually happened to those leads) — these are two different, legitimate counting systems and the UI labels them separately rather than conflating them. "Missed" leads use `firstResponseAt` (set the first time `updateLeadStatus` runs) compared against `assignedAt` with a 20-minute SLA line, exactly matching the requested "not updated any status within 20 minutes" definition — leads never touched are still evaluated live against `Date.now()`, so an untouched lead becomes "missed" in real time as the clock passes 20 minutes, without needing a background job.
- Known issues / TODO follow-ups: "Total spend on total leads" for managers/agents is a proportional allocation (their leads ÷ total leads in range × total spend), not a true per-lead cost trace — there's no data linking a specific lead to the specific ad dollar that generated it, so exact attribution isn't possible with the current mock data model. `computeROIMultiple` uses lead `dealValue` (property price) as "booking value," not actual brokerage/commission revenue, since commission % isn't tracked on Lead/Invoice yet.
- Next up: if precise revenue-based ROI is wanted, tie ROI to `Invoice.totalAmount` (or a commission field) instead of `dealValue`. If exact spend-to-lead attribution is wanted, `Lead` would need an `adSpendRecordId` (or campaign+date key) set at ingestion time instead of the proportional-allocation approximation.

### Properties system
- `Property` model extended in `src/context/AppContext.tsx` with: `zone`, `priceType` ("Absolute"/"Starting From"), `propertyStatus`, `leadRegistrationUrl`, `tags`, `mediaFileNames`, `teamAssignmentMode` ("ALL_MEMBERS"/"CUSTOM_MEMBERS"), `leadAssignmentMode` ("ROUND_ROBIN"/"PERCENTAGE"), `assignedTeam` (`PropertyTeamMember[]` — userId/name/optional percentage). `addProperty` needed no signature change (still `Omit<Property, "id" | "membersCount">`).
- New `src/components/properties/AddPropertyModal.tsx` — 2-tab wizard ("Basic Information" / "Team Members") matching the provided design: property name/builder/type/status/possession date/price+price-type/website URL/lead registration URL/description/tags, then a Contact & Location block (contact number/zone/locality/map URL), then Media & Documents (drag-and-drop, filenames only — no real upload backend). Team Members tab: "All Members" vs "Custom Members" radio; Custom Members reveals a Lead Assignment Mode toggle (Round Robin / Percentage Based) and a checklist of the SALES-department team (agents + managers/TLs) pulled from `users`, with per-member percentage inputs when in Percentage mode.
- `src/app/dashboard/properties/page.tsx` rewritten: table columns are now Property, Builder, Zone, Locality, Type, Price, Team, Actions (horizontally scrollable). Filters: search (name/builder/locality/zone), Builder, Zone, Property Type, and Team (by assigned member name or "All Members"). Old inline Add Property modal replaced by `AddPropertyModal`; the edit-in-place detail panel gained a Zone field and now displays Zone/Assigned Team/Lead Assignment Mode/Tags.
- Known issue / TODO: the round-robin/percentage config is captured and stored per property but not yet wired into actual lead auto-assignment (e.g. `addLead`) — there's no live demo of a lead being routed to a member yet, since that would require reworking the CRM "assign agent" flow, which wasn't in scope for this pass. The engine (cursor/weighted picker) still needs to be built when that's tackled.

### Calendar system
- `CalendarEvent` model + `calendarEvents` state + `addCalendarEvent` / `deleteCalendarEvent` live in `src/context/AppContext.tsx`. Event types: `SITE_VISIT`, `FOLLOWUP`, `BOOKING`, `EOI` (CRM), `HOLIDAY`, `ABSENCE`, `ADMIN_EVENT` (HRMS), `PAYMENT_REMINDER`, `TASK` (Finance).
- Shared UI: `src/components/calendar/MonthCalendar.tsx` (month grid, prev/next/today nav, color-coded event dots, click-to-select day) and `src/components/calendar/AddCalendarEventModal.tsx` (generic add-event form reused by HRMS and Finance).
- **CRM Calendar** — new route `src/app/dashboard/crm/calendar/page.tsx`. Read-only aggregation of site visits, follow-ups, bookings, and EOI events. Clicking an event with a `leadId` deep-links to `/dashboard/crm?openLead=<id>` (same drawer mechanism as notifications). Events are generated by real actions: `LeadDetailDrawer`'s reminder save creates a `SITE_VISIT`/`FOLLOWUP` event; `updateLeadStatus` creates a `BOOKING` event on Booking Done/Approved and an `EOI` event on EOI Customers status.
- **HRMS Calendar** — new `?tab=calendar` tab in `src/app/dashboard/hrms/page.tsx`. Shows company holidays, per-day absences (click a day to see the list of employee names out that day, via `employeeNames` on the `ABSENCE` event), and admin-scheduled team events. Only admins see the "Add Event" button; since `calendarEvents` is shared global state, anything an admin adds is immediately visible on every member's HRMS calendar (no extra visibility flag needed).
- **Finance Calendar** — new `?tab=calendar` tab in `src/app/dashboard/finance/page.tsx`. Shows payment reminders and tasks (with optional amount). "Add Reminder / Task" button open to any Finance user (not admin-gated, consistent with the existing "Create Invoice Ledger" button).
- **Admin Cockpit Calendar** — new route `src/app/dashboard/admin/calendar/page.tsx`. Read-only combined view of all CRM + HRMS + Finance events, color-coded by system; clicking an event deep-links into the owning module's calendar (or the lead drawer for CRM).
- Nav: "Calendar" added to the CRM main nav, HRMS nav (`?tab=calendar`), Finance nav (`?tab=calendar`), and the Admin Cockpit nav override, all in `src/app/dashboard/layout.tsx`. Route access reuses the existing `checkUserAccess()` prefix gating (`/dashboard/crm/...`, `/dashboard/admin/...`), so no new access-control code was needed.
- Seed data (`INITIAL_CALENDAR_EVENTS`) gives each calendar concrete demo events dated around 2026-07-14 (today) through November so the calendars aren't empty on first load.

### Notifications system
- `Notification` model + `notifications` state + `addNotification` / `markNotificationRead` / `markAllNotificationsRead` live in `src/context/AppContext.tsx`.
- `NotificationBell` (bell icon + dropdown) is mounted in `src/app/dashboard/layout.tsx` header; content adapts to `activeSystem`:
  - **CRM**: two sections, "New Leads" and "Reminder Alerts". Clicking an item routes to `/dashboard/crm?openLead=<id>`; `LeadDashboard.tsx` reads that query param on mount, opens `LeadDetailDrawer` for the matching lead, then clears the param.
  - **HRMS**: single "HRMS Alerts" list (attendance/lateness patterns, leave, regularization requests, onboarding).
  - **FINANCE**: single "Finance Alerts" list (draft invoices pending generation, pending reimbursement claims, KYC verification events).
  - **ADMIN**: all four sections combined (CRM New Leads, CRM Reminders, HRMS, Finance) — the cockpit-wide view.
- Notifications are created in real time by real actions, not just seeded: `addLead` → New Lead notif, `LeadDetailDrawer`'s reminder save → Reminder notif, `submitRegularization` → HRMS notif, `addReimbursementClaim` / `generateInvoice` / `verifyKYC` → Finance notifs.
- Initial seed data (`INITIAL_NOTIFICATIONS`) is derived from the existing mock leads/followups/attendance/invoices/claims so the demo isn't empty on first load.

### State
- `src/context/AppContext.tsx` — global app context/state provider

### Not yet started
- Database layer (target: PostgreSQL per blueprint)
- Auth/OAuth backend
- Payment/billing backend for provisioning & checkout
- HRMS geofenced telemetry / GPS punch-in backend
- Finance invoice/GST generation backend
- Mobile (Capacitor) wrapper

---

## Log

### 2026-07-14 — Initial implementation log created
- Created this file (`IMPLEMENTATIONS.md`) to track ongoing work across sessions.
- Audited repo state: single commit (`ea84630 Initial commit from Create Next App`) plus a large set of uncommitted/untracked work — CRM, HRMS, Finance, dashboard, auth, checkout, and provisioning UI scaffolding already exist locally but are not yet committed to git.
- No functional changes made in this session.
- **Next up:** decide whether to commit the existing uncommitted work, then prioritize which module (CRM/HRMS/Finance/Auth) gets backend wiring first.

### 2026-07-14 — Notifications system (CRM/HRMS/Finance/Admin)
- What was done: Built a cross-module notification system. Added `Notification` type, `notifications` state, and `addNotification`/`markNotificationRead`/`markAllNotificationsRead` actions to `AppContext`. Built `NotificationBell` (bell + unread badge + dropdown) and mounted it in the dashboard header. Content is scoped by `activeSystem`: CRM shows "New Leads" + "Reminder Alerts" (click opens the specific lead's detail drawer via `?openLead=<id>` deep link), HRMS shows HRMS alerts, Finance shows finance alerts, Admin cockpit shows all of the above combined.
- Files touched: `src/context/AppContext.tsx` (model, state, actions, seed data, hooked into `addLead`/`submitRegularization`/`verifyKYC`/`generateInvoice`/`addReimbursementClaim`), `src/components/dashboard/NotificationBell.tsx` (new), `src/app/dashboard/layout.tsx` (mounted bell in header), `src/components/crm/LeadDashboard.tsx` (reads `openLead` query param, opens drawer), `src/components/crm/LeadDetailDrawer.tsx` (reminder save now also raises a notification, not just an alert).
- Decisions made (and why): Refactored the previously-inline `reimbursements`/`invoices` mock arrays into top-level `INITIAL_REIMBURSEMENTS`/`INITIAL_INVOICES` consts so the notification seed builder could reference the same data without duplicating it. Notifications are generated by real actions (not just static seed data) so the feed genuinely updates in real time as the user works, matching the "real-time" requirement. Deep-linking (`?openLead=`) was chosen over a global drawer-in-context approach to avoid moving lead-detail UI state out of `LeadDashboard`, keeping the change smaller.
- Known issues / TODO follow-ups: No backend/websocket — "real-time" here means instant React state updates on user actions within the same session, not push notifications from a server or across browser tabs/users. No persistence — notifications reset on page reload. No notification for `punchIn`/`punchOut`/`approveRegularization`/`markInvoicePaid`/claim approve-reject yet — only the "creation" events were wired up per the request; can extend the same pattern if approval-side notifications are wanted too.
- Next up: decide whether to also notify on approval/rejection actions (e.g., admin approves a regularization request → notify the requesting employee), and whether unread counts should persist (localStorage) across reloads.

### 2026-07-14 — CRM/HRMS/Finance/Admin dropdown redesign for notifications panel
- What was done: Reworked `NotificationBell` so CRM (and Admin) notification groups are selected via a dropdown instead of stacking every section in one long scrollable list, per user feedback that the stacked layout "doesn't look well."
- Files touched: `src/components/dashboard/NotificationBell.tsx` (rewritten to build a `groups` array per `activeSystem` and render a `<select>` to switch between them; single-list systems like HRMS/Finance render directly with no dropdown).
- Decisions made (and why): Kept HRMS/Finance panels dropdown-free since they only have one group each — a dropdown with one option adds clutter with no benefit.
- Next up: none outstanding for notifications; see the Calendar system entry below.

### 2026-07-14 — Calendar system (CRM/HRMS/Finance/Admin Cockpit)
- What was done: Added a full calendar feature across every module, described in the "Calendar system" section above. New `CalendarEvent` model/state/actions in `AppContext`; a shared `MonthCalendar` grid and `AddCalendarEventModal`; a new CRM calendar route, new HRMS/Finance calendar tabs, a new aggregated Admin Cockpit calendar route; nav entries wired into `dashboard/layout.tsx`.
- Files touched: `src/context/AppContext.tsx`, `src/components/calendar/MonthCalendar.tsx` (new), `src/components/calendar/AddCalendarEventModal.tsx` (new), `src/app/dashboard/crm/calendar/page.tsx` (new), `src/app/dashboard/admin/calendar/page.tsx` (new), `src/app/dashboard/hrms/page.tsx`, `src/app/dashboard/finance/page.tsx`, `src/app/dashboard/layout.tsx`, `src/components/crm/LeadDetailDrawer.tsx`.
- Decisions made (and why): CRM calendar is a standalone route (matches the existing Properties/Resale pattern of separate CRM sub-routes), while HRMS/Finance calendars are `?tab=calendar` additions (matches how Teams/Attendance/Billing/Reimbursements are already implemented as tabs on those pages) — kept each module internally consistent with its existing navigation style rather than forcing one pattern everywhere. HRMS "admin-added events visible to all members" needed no extra visibility flag/backend fan-out — because `calendarEvents` is one shared context array in this frontend-only prototype, everyone reading it sees the same admin-added event immediately.
- Known issues / TODO follow-ups: Same caveat as notifications — no backend, so events don't persist across reloads or sync across browser tabs/users. CRM calendar events are only created via the reminder-picker flow and status transitions (Booking/EOI); there's no direct "add CRM event" UI since the request only asked for aggregation/derivation there, not manual creation.
- Next up: if real persistence is wanted, calendar events and notifications should move to the same backend layer together (they share the same "seed from mock data + real-time local updates" pattern).

### 2026-07-14 — Properties section rework (search/table format + new Add Property wizard + team assignment)
- What was done: Rebuilt the Properties module described in the "Properties system" section above — extended the `Property` data model with zone/status/tags/media/team-assignment fields, replaced the old single-step Add Property modal with a 2-tab wizard matching the supplied design mockups (Basic Information / Team Members, including Round Robin vs Percentage-based lead assignment mode and a selectable sales team checklist), and reworked the properties list into the requested table format (Builder/Zone/Locality/Type/Price/Team columns) with matching filters.
- Files touched: `src/context/AppContext.tsx` (Property model extension), `src/components/properties/AddPropertyModal.tsx` (new), `src/app/dashboard/properties/page.tsx` (filters, table, detail panel, modal wiring).
- Decisions made (and why): Team member picker is scoped to `users` where `department === "SALES"` (excludes Finance/Tech/Marketing/Admin) since the request specifically named "sales agents and managers or TL." Zone and Locality are free-text inputs with a `<datalist>` of previously-used values rather than closed dropdowns, since the mock data doesn't define a fixed zone/locality taxonomy — this keeps data entry flexible while still surfacing existing values for consistency. Media/document upload only records filenames client-side (no storage backend exists yet), consistent with how the rest of the app handles file inputs (e.g. lead KYC doc name only).
- Known issues / TODO follow-ups: see the round-robin/percentage auto-assignment gap noted in "Properties system" above — the assignment config is stored but not yet consumed by the CRM lead-creation flow.
- Next up: if/when lead auto-assignment is wanted end-to-end, build a `pickAgentForProperty(propertyId)` helper in `AppContext` (round-robin cursor per property + weighted-random for percentage mode) and call it from `addLead`/bulk import when `assignedAgent` is left unset for a property with `teamAssignmentMode === "CUSTOM_MEMBERS"`.

### 2026-07-14 — Properties table: per-row Edit button, compact + responsive layout
- What was done: Added a dedicated Edit icon button next to Details in each properties table row (admin-only) that jumps straight into the inline edit form instead of requiring Details → toggle edit. Then, per follow-up feedback that the table needed a horizontal scrollbar, removed the scrollbar entirely: tightened the desktop table to `table-fixed` with percentage column widths and smaller padding/font, merged Zone+Locality into one Location column, swapped text action buttons for icon-only buttons, and added a genuinely different mobile layout (stacked cards, `hidden md:block` / `md:hidden` split) instead of squeezing the table onto small screens.
- Files touched: `src/app/dashboard/properties/page.tsx`.
- Next up: none outstanding for Properties.

### 2026-07-14 — Reports system (Marketing / Manager / Sales Agent reports)
- What was done: Built the 3-section Reports feature described in the "Reports system" section above, including new SLA-tracking fields on `Lead`, a new `AdSpendRecord` marketing data model, and a shared `reportMetrics.ts` calculation library. All three sections generate off one shared calendar date-range filter.
- Files touched: `src/context/AppContext.tsx` (Lead SLA fields, `AdSpendRecord` type + seed data + state, `reassignLead` action, `addLead`/`updateLeadStatus` now stamp SLA timestamps and log status changes), `src/lib/reportMetrics.ts` (new), `src/components/reports/DateRangeFilter.tsx` (new), `src/components/reports/MarketingReports.tsx` (new), `src/components/reports/ManagerReports.tsx` (new), `src/components/reports/AgentReports.tsx` (new), `src/app/dashboard/reports/page.tsx` (rebuilt as the 3-tab orchestrator, replacing the old single-tab placeholder).
- Decisions made (and why): see "Reports system" above for the CPL-vs-CRM-quality data-source split and the live (no-cron-needed) missed-lead SLA check.
- Known issues / TODO follow-ups: see "Reports system" above — spend attribution is proportional/estimated (no per-lead ad-spend linkage exists yet), and ROI is based on property `dealValue` rather than actual brokerage/commission revenue.
- Next up: same as noted in "Reports system" — commission-based ROI and exact spend-to-lead attribution would need small additions to `Lead`/`Invoice`, not a redesign, whenever that precision is wanted.

### 2026-07-14 — Currency symbol fix: $ → ₹ across the whole app
- What was done: An editor/linter auto-format pass silently corrupted every ₹ (rupee) symbol in the codebase to $ at some point mid-session (visible in Reports' CPL/Total Ad Spend cards). Found and fixed all real occurrences app-wide, not just the newly-built Reports feature — the corruption had also hit pre-existing pages (checkout, organization, HRMS, dashboard home, LeadDetailDrawer) that were never touched this session, confirming it was a blanket find/replace or bad-encoding save rather than something introduced by my own edits.
- Files touched: `src/app/checkout/page.tsx`, `src/app/dashboard/finance/page.tsx`, `src/app/dashboard/hrms/page.tsx`, `src/app/dashboard/organization/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/resale/page.tsx`, `src/components/crm/LeadDetailDrawer.tsx`, `src/components/dashboard/FinanceAudit.tsx`, `src/components/dashboard/MarketingOperations.tsx`, `src/context/AppContext.tsx` (mock property prices + notification/calendar message strings), `src/lib/reportMetrics.ts` (`formatCurrency` helper — this was the one feeding the Reports screenshot the user flagged).
- Decisions made (and why): Verified precisely which `$` occurrences were real currency (via keyword-targeted grep + manual read of each hit) rather than blanket-replacing every `$` in the repo, since `${...}` is also legitimate Tailwind conditional-class template-literal syntax used hundreds of times across the app (e.g. `` `bg-red-${isActive ? "600" : "400"}` ``) — a naive regex replace would have broken those.
- Known issues / TODO follow-ups: No root cause fix applied for *why* the corruption happened (unclear if it was this editor/IDE's save encoding, a formatter, or something else) — if ₹ symbols disappear again, check file encoding settings (₹ is outside ASCII/Latin-1 and needs UTF-8) before assuming it's a repeat of the same issue.
- Next up: none outstanding; worth a final visual pass in the browser across Checkout, Finance, HRMS, and Reports to confirm ₹ renders correctly (not just that the source no longer contains `$`), since this was caught via a screenshot rather than the dev server smoke tests.

### 2026-07-14 — Manager Reports: split Individual vs Team spend/ROI (previously only combined)
- What was done: The Manager Reports table originally computed one "Allocated Spend" and one "ROI" from the manager's individual + team leads combined, so per-manager individual performance wasn't visible on its own. Reworked to compute and display three separate groups per manager: **Individual (Self)** (their own leads/spend/ROI/missed), **Team** (their direct reports' leads/spend/ROI/missed), and **Combined** (both together) — matching the request for "how many leads they get and how much spend on individual managers itself and with team both, then ROI." Also added per-team-member spend and ROI (not just lead count) to the expandable team breakdown.
- Files touched: `src/components/reports/ManagerReports.tsx` (rewritten — grouped two-tier table header, individual/team/combined metric computation).
- Decisions made (and why): Spend/ROI for "Individual" and "Team" are each computed independently from their own lead subset (not derived by splitting a combined total), so "Combined" is a true sum of the two rather than a separately-computed aggregate — keeps the three numbers internally consistent (individual + team spend always equals combined spend).
- Next up: none outstanding for Manager Reports.

### 2026-07-14 — Settings page rebuild (Connected Apps / Leads / Manage Users / About)
- What was done: Replaced the old 4-tab Settings page (Connected Apps / Webhooks / Messaging Templates / General Settings — the latter three were unrequested placeholders) with the requested structure: **Connected Apps** (kept the integrations grid, renamed "Facebook" → "Meta Ads" and reordered Meta/Google first since those were named explicitly), **Leads** (new — ranked bar-list breakdown of `leads` grouped by `source`/`campaign`, showing where the pipeline majority comes from), **Manage Users** (new — Admin/Managers/IT/Marketing/Finance count cards, a name/email/phone search box, and a card per user with department badge, email, phone, an eye-icon toggle that reveals that user's login password inline, and an Edit button), **About** (new — version string, Privacy Policy / Terms of Service placeholder dialogs, and a Sign Out button that calls `logout()` + redirects to `/auth/login`, same pattern as the sidebar logout).
- Files touched: `src/app/dashboard/settings/page.tsx` (full rewrite).
- Decisions made (and why): Manage Users' add/edit account logic (`addTeamMember`/`updateUserFields`/`deleteTeamMember`) and form fields were adapted from the existing `src/app/dashboard/admin/page.tsx` roster page rather than rebuilt from scratch — same underlying data/actions, just restyled as cards with a per-user credential-reveal toggle instead of a wide table, per the requested layout. `admin/page.tsx` itself was left as-is (not deleted) since removing it wasn't requested and it's still reachable/functional independently.
- Known issues / TODO follow-ups: Settings' Manage Users and `/dashboard/admin` are now two separate UIs over the same user data — worth deciding later whether `/dashboard/admin` should redirect into Settings' Manage Users tab to avoid maintaining two editors for the same thing.
- Next up: none outstanding for Settings.

<!--
TEMPLATE FOR NEW ENTRIES — copy this block and fill in for each work session:

### YYYY-MM-DD — <short title>
- What was done:
- Files touched:
- Decisions made (and why):
- Known issues / TODO follow-ups:
- Next up:
-->
