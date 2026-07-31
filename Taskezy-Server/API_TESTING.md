# TASKEZY API — Manual Testing Reference

Every endpoint currently exposed by `Taskezy-Server`, with method, path, auth/role requirements, request body, and a ready-to-run `curl` example. Written for **manual testing and redesign** — use this as the checklist while you re-architect the API structure.

- Base URL (local): `http://localhost:4000`
- Every response is `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code": "...", "message": "..." } }`. List endpoints that paginate also return `"meta": { page, pageSize, totalCount, totalPages }`.
- Auth: `Authorization: Bearer <accessToken>` header on every route except `/health`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`.
- Access tokens expire in **15 minutes**. Refresh tokens live in an httpOnly cookie (`credentials: include` / curl `-b`/`-c` cookie jar) and rotate on every `/refresh` call.
- Rate limits: general API 100 req / 15 min (`RATE_LIMIT_*` env), auth endpoints 10 req / 15 min.
- Roles: `ADMIN`, `FINANCE`, `AGENT` (with `roleType`: `MANAGER` or `MEMBER`).

---

## 0. Setup — get a token

```bash
# Start the server (separate terminal): cd Taskezy-Server && npm run dev
# Postgres must be running (Docker container taskezy_postgres, port 5433)

# Login as the seeded demo admin
curl -s -c cookies.txt -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realhubb.in","password":"admin"}'
```

Copy `data.accessToken` from the response into a shell variable for every other call:

```bash
TOKEN="paste-access-token-here"
```

Other seeded demo logins (see `Taskezy_DB/generate_seed.js`): `sales1@realhubb.in` / `member` (AGENT, roleType MEMBER), `sales.manager1@realhubb.in` / `manager` (AGENT, roleType MANAGER) — useful for testing role restrictions.

---

## 1. Auth (`/api/v1/auth`)

| Method | Path | Auth | Role |
|---|---|---|---|
| POST | `/login` | none | — |
| POST | `/refresh` | refresh cookie | — |
| POST | `/logout` | none | — |
| GET | `/me` | Bearer | any |

```bash
curl -s -c cookies.txt -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"admin@realhubb.in","password":"admin"}'

curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/v1/auth/refresh

curl -s -X POST http://localhost:4000/api/v1/auth/logout -b cookies.txt

curl -s http://localhost:4000/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
```

---

## 2. Leads (`/api/v1/leads`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/` | Bearer | any | paginated, scoped: AGENT+MEMBER sees only own leads |
| GET | `/:id` | Bearer | any | same scoping |
| POST | `/` | Bearer | any | duplicate-phone rejected with 409 |
| PATCH | `/:id/status` | Bearer | any (scoped) | |
| PATCH | `/:id` | Bearer | any (scoped) | edit name/email/source/campaign/propertyId/leadScore |
| PATCH | `/:id/reassign` | Bearer | **ADMIN** | restarts SLA clock |
| DELETE | `/:id` | Bearer | **ADMIN** | 409 if an invoice references it |
| PATCH | `/:id/kyc` | Bearer | **ADMIN, FINANCE** | sets `kyc_verified = true` |

```bash
# List (paginated) — query: page, pageSize (max 100), status, assignedAgentId, search
curl -s "http://localhost:4000/api/v1/leads?page=1&pageSize=25" -H "Authorization: Bearer $TOKEN"

# Get one
curl -s http://localhost:4000/api/v1/leads/<leadId> -H "Authorization: Bearer $TOKEN"

# Create
curl -s -X POST http://localhost:4000/api/v1/leads -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test Lead","phone":"9876543210","email":"test@example.com","assignedAgentId":"<userId>"}'

# Update status (statusCode is one of the 27 lead_statuses codes, e.g. NEW/CONTACTED/BOOKING_APPROVED)
curl -s -X PATCH http://localhost:4000/api/v1/leads/<leadId>/status -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"statusCode":"INTERESTED","dealValue":2500000}'

# Edit
curl -s -X PATCH http://localhost:4000/api/v1/leads/<leadId> -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"leadScore":80}'

# Reassign (ADMIN only)
curl -s -X PATCH http://localhost:4000/api/v1/leads/<leadId>/reassign -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"newAgentId":"<userId>"}'

# Delete (ADMIN only)
curl -s -X DELETE http://localhost:4000/api/v1/leads/<leadId> -H "Authorization: Bearer $TOKEN"

# KYC verify (ADMIN/FINANCE only)
curl -s -X PATCH http://localhost:4000/api/v1/leads/<leadId>/kyc -H "Authorization: Bearer $TOKEN"
```

---

## 3. Users (`/api/v1/users`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/` | Bearer | any | active-only directory (no password_hash) |
| POST | `/` | Bearer | **ADMIN** | plaintext `password`, hashed server-side |
| PATCH | `/:id` | Bearer | **ADMIN** | blocks deactivating the last admin |
| PATCH | `/:id/password` | Bearer | **ADMIN** | reset, sets `must_reset_password` |
| DELETE | `/:id` | Bearer | **ADMIN** | blocks self-delete + last-admin delete; 409 on FK (assigned leads/invoices/claims) |

```bash
curl -s http://localhost:4000/api/v1/users -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:4000/api/v1/users -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"testuser@realhubb.in","role":"AGENT","roleType":"MEMBER","department":"SALES","password":"password123"}'

curl -s -X PATCH http://localhost:4000/api/v1/users/<userId> -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"designation":"Senior Sales Executive","status":"ACTIVE"}'

curl -s -X PATCH http://localhost:4000/api/v1/users/<userId>/password -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"newPassword":"newpassword123"}'

curl -s -X DELETE http://localhost:4000/api/v1/users/<userId> -H "Authorization: Bearer $TOKEN"
```

---

## 4. Properties (`/api/v1/properties`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/` | Bearer | any |
| GET | `/:id` | Bearer | any |
| POST | `/` | Bearer | **ADMIN** |
| PATCH | `/:id` | Bearer | **ADMIN** |
| DELETE | `/:id` | Bearer | **ADMIN** |

```bash
curl -s http://localhost:4000/api/v1/properties -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:4000/api/v1/properties -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test Towers","developer":"Test Developer","location":"Test Location, Test Zone","propertyType":"Residential","priceValue":15000000,"priceType":"ABSOLUTE"}'

curl -s -X PATCH http://localhost:4000/api/v1/properties/<propertyId> -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"propertyStatus":"Under Construction"}'

curl -s -X DELETE http://localhost:4000/api/v1/properties/<propertyId> -H "Authorization: Bearer $TOKEN"
```

---

## 5. Resale units (`/api/v1/resale-units`)

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/` | Bearer | any |
| POST | `/` | Bearer | any (unrestricted — matches frontend) |

```bash
curl -s http://localhost:4000/api/v1/resale-units -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:4000/api/v1/resale-units -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"propertyName":"Resale Test Unit","builder":"Test Builder","price":"1.2 Cr"}'
```

*No PATCH/DELETE exists yet for resale units — first thing worth deciding in a redesign.*

---

## 6. Follow-up calls (`/api/v1/followups`) — read-only

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/` | Bearer | any |

```bash
curl -s http://localhost:4000/api/v1/followups -H "Authorization: Bearer $TOKEN"
```

*No write endpoints exist — calls are presumably meant to be derived from calendar events or created directly. Worth deciding in the redesign.*

---

## 7. Attendance (`/api/v1/attendance`) — read-only, derived view

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/` | Bearer | any |

```bash
curl -s http://localhost:4000/api/v1/attendance -H "Authorization: Bearer $TOKEN"
```

Reads `attendance_view`, a Postgres VIEW aggregated from `timesheet_logs` — not a writable table itself. Actual writes happen via `/api/v1/timesheets` (section 12).

---

## 8. Reimbursement claims (`/api/v1/reimbursements`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/` | Bearer | any | all claims, not scoped |
| POST | `/` | Bearer | any | `agent_id` is always the caller — never from the body |
| PATCH | `/:id/approve` | Bearer | **ADMIN, FINANCE** | only PENDING → PAID |
| PATCH | `/:id/reject` | Bearer | **ADMIN, FINANCE** | only PENDING → REJECTED |
| DELETE | `/:id` | Bearer | **ADMIN** | |

```bash
curl -s http://localhost:4000/api/v1/reimbursements -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:4000/api/v1/reimbursements -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Fuel claim","claimType":"TRAVEL","amount":500,"notes":"Site visit travel"}'

curl -s -X PATCH http://localhost:4000/api/v1/reimbursements/<claimId>/approve -H "Authorization: Bearer $TOKEN"
curl -s -X PATCH http://localhost:4000/api/v1/reimbursements/<claimId>/reject -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE http://localhost:4000/api/v1/reimbursements/<claimId> -H "Authorization: Bearer $TOKEN"
```

*Note: GET isn't scoped to "my own claims" the way leads are — every authenticated user currently sees every claim. Worth a look in the redesign if that's not intended.*

---

## 9. Invoices (`/api/v1/invoices`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/` | Bearer | any | |
| PATCH | `/:id/generate` | Bearer | **ADMIN, FINANCE** | recalculates CGST/SGST from `base_amount`, sets status PAID |
| PATCH | `/:id/mark-paid` | Bearer | **ADMIN, FINANCE** | just flips status to PAID |
| DELETE | `/:id` | Bearer | **ADMIN** | |

```bash
curl -s http://localhost:4000/api/v1/invoices -H "Authorization: Bearer $TOKEN"
curl -s -X PATCH http://localhost:4000/api/v1/invoices/<invoiceId>/generate -H "Authorization: Bearer $TOKEN"
curl -s -X PATCH http://localhost:4000/api/v1/invoices/<invoiceId>/mark-paid -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE http://localhost:4000/api/v1/invoices/<invoiceId> -H "Authorization: Bearer $TOKEN"
```

*Note: there's no `POST /` to create an invoice — invoices are only ever born as a side effect of a lead reaching Booking Done/Approved on the frontend, with `base_amount` never actually getting set anywhere (a pre-existing gap ported as-is, not introduced here — see IMPLEMENTATIONS.md). Worth fixing properly in the redesign: either a real `POST /invoices` tied to a lead + deal value, or a documented trigger path.*

---

## 10. Notifications (`/api/v1/notifications`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/` | Bearer | any | scoped: own + broadcast (`recipient_user_id IS NULL`) |
| PATCH | `/:id/read` | Bearer | any | same scoping |
| PATCH | `/read-all` | Bearer | any | optional `?system=CRM\|HRMS\|FINANCE\|ADMIN` |

```bash
curl -s http://localhost:4000/api/v1/notifications -H "Authorization: Bearer $TOKEN"
curl -s -X PATCH http://localhost:4000/api/v1/notifications/<notifId>/read -H "Authorization: Bearer $TOKEN"
curl -s -X PATCH "http://localhost:4000/api/v1/notifications/read-all?system=CRM" -H "Authorization: Bearer $TOKEN"
```

*Note: no `POST /` — notifications are only ever created as a side effect of other actions (new lead, claim submitted, etc.) server-side... except they're currently NOT created server-side at all (only client-side, locally). This is a real gap: notifications exist as a table and are readable, but nothing on the backend inserts a row into it yet. Worth deciding in the redesign whether notification-creation should move server-side (recommended — a client-only `addNotification` can't notify anyone but the browser tab that fired it).*

---

## 11. Calendar events (`/api/v1/calendar-events`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/` | Bearer | any | includes `attendee_names` array |
| POST | `/` | Bearer | any (unrestricted) | `attendeeUserIds` optional |
| DELETE | `/:id` | Bearer | any (unrestricted) | not wired to any frontend button yet |

```bash
curl -s http://localhost:4000/api/v1/calendar-events -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:4000/api/v1/calendar-events -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"system":"ADMIN","eventType":"TASK","title":"Test event","date":"2026-08-01"}'

curl -s -X DELETE http://localhost:4000/api/v1/calendar-events/<eventId> -H "Authorization: Bearer $TOKEN"
```

`eventType` one of: `SITE_VISIT`, `FOLLOWUP`, `BOOKING`, `EOI`, `HOLIDAY`, `ABSENCE`, `ADMIN_EVENT`, `PAYMENT_REMINDER`, `TASK`.

---

## 12. Timesheets / HRMS (`/api/v1/timesheets`)

| Method | Path | Auth | Role | Notes |
|---|---|---|---|---|
| GET | `/` | Bearer | any | self-scoped unless ADMIN/FINANCE |
| POST | `/punch-in` | Bearer | any | 409 if already punched in today |
| PATCH | `/punch-out` | Bearer | any | 400 if no open shift |
| POST | `/:id/regularize` | Bearer | any | must own the timesheet |
| PATCH | `/:id/regularize/approve` | Bearer | **ADMIN** | |
| PATCH | `/:id/regularize/reject` | Bearer | **ADMIN** | |

```bash
curl -s http://localhost:4000/api/v1/timesheets -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:4000/api/v1/timesheets/punch-in -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lat":19.076,"lng":72.8777}'

curl -s -X PATCH http://localhost:4000/api/v1/timesheets/punch-out -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:4000/api/v1/timesheets/<timesheetId>/regularize -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"requestedIn":"2026-07-21T03:30:00.000Z","requestedOut":"2026-07-21T12:30:00.000Z","reason":"Forgot to punch out"}'

curl -s -X PATCH http://localhost:4000/api/v1/timesheets/<timesheetId>/regularize/approve -H "Authorization: Bearer $TOKEN"
curl -s -X PATCH http://localhost:4000/api/v1/timesheets/<timesheetId>/regularize/reject -H "Authorization: Bearer $TOKEN"
```

*Note: the geofence check (is the punch-in location within range of the office) currently only happens client-side in `AppContext.tsx`, not server-side — a scripted client could punch in from anywhere. Worth moving into `timesheets.routes.ts` in the redesign if that's meant to be a real control, not just a UX nudge.*

---

## 13. Ad spend (`/api/v1/ad-spend`) — read-only

| Method | Path | Auth | Role |
|---|---|---|---|
| GET | `/` | Bearer | any |

```bash
curl -s http://localhost:4000/api/v1/ad-spend -H "Authorization: Bearer $TOKEN"
```

*No write endpoints — ad spend is presumably meant to be ingested from Meta/Google Ads APIs, not entered manually. Worth an explicit decision either way.*

---

## 14. Health (`/health`) — no auth

```bash
curl -s http://localhost:4000/health
```

Returns 200 `{ status: "healthy" }` or 503 `{ status: "unhealthy" }` based on DB connectivity — used by load balancers, not the frontend.

---

## Known structural rough edges worth revisiting in a redesign

These are observations from building the CRUD layer, not necessarily bugs — flagging them here since a manual redesign pass is exactly the right time to fix them:

1. **Inconsistent nesting depth.** `leads`, `users`, `properties` have a full `routes → controller → service → repository` split; everything built in the most recent CRUD pass (`resale-units`, `reimbursements`, `invoices`, `notifications`, `calendar-events`, `timesheets`) is a single flat `*.routes.ts` file with inline SQL. That was a deliberate "don't add layers a route doesn't need yet" call, but it means the codebase has two different shapes for "a module" — worth picking one and reconciling.
2. **Notifications are never created server-side.** The `notifications` table and its read/mark-read endpoints exist, but nothing server-side ever inserts a row (new lead, claim submitted, invoice generated, etc. — all of that lives in the frontend's `addNotification()` calls, which only affect the caller's own browser tab). A real notification system needs this to move server-side.
3. **Reimbursements GET is unscoped.** Every domain that has a "who can see this" question (leads, timesheets) enforces it server-side except reimbursement claims, where any authenticated user can currently list every claim in the company.
4. **Invoices have no creation endpoint.** They're only ever produced as an unfinished side-effect chain from the frontend (lead → Booking Approved → local-only invoice object with `base_amount` never actually populated). This is the single biggest "the data model doesn't fully close the loop yet" gap.
5. **Ad spend and follow-up calls are 100% read-only** with no defined path for how rows are supposed to get into those tables (manual entry? platform API sync? derived from calendar events?) — worth deciding intent before designing the write side.
6. **Client-side-only business rules that look like server rules.** The HRMS punch-in geofence check and the frontend's phone-format/duplicate-lead validation are both real rules but currently only enforced in `AppContext.tsx`, not re-checked by the API — anyone calling the API directly bypasses them (leads' duplicate-phone check *is* re-enforced server-side already; the geofence check is not).
