import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query } from "../../db/pool";
import { consumeTicket, issueTicket } from "../../utils/sseTickets";
import { subscribe } from "../../utils/sseHub";

// Express's `qs` query parser turns a single `?category=A` into a bare string
// but repeated `?category=A&category=B` into an array — normalize either
// shape into a plain array (or undefined if omitted), same helper leads.schema.ts
// uses for its own multi-select filters.
const stringToArray = z.union([z.string(), z.array(z.string())])
  .optional()
  .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v]));

export const notificationsRouter = Router();

const HEARTBEAT_MS = 25000;

// Registered BEFORE requireAuth below: the browser's EventSource API cannot
// set an Authorization header, so this route is authenticated by a one-time
// ticket (see utils/sseTickets.ts) instead of the normal Bearer token — mint
// one via POST /stream-ticket (which does require the normal Bearer header)
// immediately before opening the EventSource.
notificationsRouter.get("/stream", (req, res) => {
  const ticket = req.query.ticket;
  if (typeof ticket !== "string") {
    res.sendStatus(401);
    return;
  }
  const userId = consumeTicket(ticket);
  if (!userId) {
    res.sendStatus(401);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Also needed at the nginx layer (proxy_buffering off) for this to
    // actually stream in production instead of arriving in one flush.
    "X-Accel-Buffering": "no"
  });
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  const unsubscribe = subscribe(userId, res);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

notificationsRouter.use(requireAuth);

// Mints a one-time, ~45s-lived ticket for the caller (a real Bearer-token
// request, unlike /stream itself) — the frontend calls this immediately
// before opening the EventSource and on every reconnect, since a ticket
// cannot be reused. See utils/sseTickets.ts for why this exists instead of
// putting the real access token in the stream URL.
notificationsRouter.post("/stream-ticket", (req, res) => {
  sendOk(res, { ticket: issueTicket(req.user!.sub) });
});

// notifications is one of the fastest-growing, zero-cap tables in this
// schema — broadcast rows (recipient_user_id IS NULL) accumulate forever for
// every user, so an unbounded SELECT here only gets more expensive over
// time. page/pageSize give real LIMIT/OFFSET pagination; pageSize defaults
// to 10 to match NotificationBell's own usePagination(..., 10, ...) call
// (its dropdown lists 10 at a time) but can go up to 500 — the same bridge
// pattern leads.schema.ts uses — for apiListNotifications()'s page-loop that
// reconstructs the full array for AppContext's bulk load (still needed
// there for simple in-memory counts elsewhere in the app).
//
// system/category/excludeCategory are optional, additive filters on top of
// the exact same recipient-scoping WHERE clause as before — they exist so
// NotificationBell's category tabs (New Leads / Reminder Alerts / Activity
// Alerts / HRMS / Finance), which each render their own independently
// paginated slice, can ask the server for exactly their own tab's page
// instead of over-fetching everything and re-slicing client-side. Omitting
// them (as apiListNotifications() does) reproduces today's unfiltered list.
const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(10),
  system: z.enum(["CRM", "HRMS", "FINANCE", "ADMIN"]).optional(),
  // Include filter — e.g. ["NEW_LEAD"] for the New Leads tab.
  category: stringToArray,
  // Exclude filter — e.g. ["NEW_LEAD", "REMINDER"] for the CRM Activity
  // Alerts tab's "everything else" catch-all.
  excludeCategory: stringToArray
});

// Scoped to the caller: rows with recipient_user_id = them, OR broadcast rows
// (recipient_user_id IS NULL) — see DATA_DICTIONARY.md's notifications table.
notificationsRouter.get(
  "/",
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, system, category, excludeCategory } = req.query as unknown as {
      page: number; pageSize: number; system?: string; category?: string[]; excludeCategory?: string[];
    };

    const conditions = ["(recipient_user_id IS NULL OR recipient_user_id = $1)"];
    const params: unknown[] = [req.user!.sub];

    if (system) {
      params.push(system);
      conditions.push(`system = $${params.length}`);
    }
    if (category && category.length > 0) {
      params.push(category);
      conditions.push(`category = ANY($${params.length}::text[])`);
    }
    if (excludeCategory && excludeCategory.length > 0) {
      params.push(excludeCategory);
      conditions.push(`category <> ALL($${params.length}::text[])`);
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countResult = await query<{ count: string }>(`SELECT count(*) FROM notifications ${whereClause}`, params);
    const totalCount = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * pageSize;
    const dataParams = [...params, pageSize, offset];
    const { rows } = await query(
      `SELECT id, system, category, title, message, read, lead_id, link, created_at
       FROM notifications
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    sendPaginated(res, rows, { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) });
  })
);

const idParamSchema = z.object({ id: z.string().uuid() });

// A notification can only be marked read by its recipient, or by anyone for a
// broadcast row (recipient_user_id IS NULL) — same visibility rule as GET.
notificationsRouter.patch(
  "/:id/read",
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE notifications SET read = true
       WHERE id = $1 AND (recipient_user_id IS NULL OR recipient_user_id = $2)
       RETURNING id`,
      [req.params.id, req.user!.sub]
    );
    if (rows.length === 0) throw ApiError.notFound("Notification not found");
    sendOk(res, { read: true });
  })
);

const markAllQuerySchema = z.object({
  system: z.enum(["CRM", "HRMS", "FINANCE", "ADMIN"]).optional()
});

notificationsRouter.patch(
  "/read-all",
  validate({ query: markAllQuerySchema }),
  asyncHandler(async (req, res) => {
    const { system } = req.query as { system?: string };
    const params: unknown[] = [req.user!.sub];
    let sql = `UPDATE notifications SET read = true WHERE (recipient_user_id IS NULL OR recipient_user_id = $1)`;
    if (system) {
      params.push(system);
      sql += ` AND system = $${params.length}`;
    }
    await pool.query(sql, params);
    sendOk(res, { read: true });
  })
);
