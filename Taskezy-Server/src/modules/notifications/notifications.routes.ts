import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query } from "../../db/pool";
import { verifyAccessToken } from "../../utils/tokens";
import { subscribe } from "../../utils/sseHub";

export const notificationsRouter = Router();

const HEARTBEAT_MS = 25000;

// Registered BEFORE requireAuth below: the browser's EventSource API cannot
// set an Authorization header, so the access token travels as a query param
// on this one route instead and is verified here directly.
notificationsRouter.get("/stream", (req, res) => {
  const token = req.query.access_token;
  if (typeof token !== "string") {
    res.sendStatus(401);
    return;
  }
  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
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

// Scoped to the caller: rows with recipient_user_id = them, OR broadcast rows
// (recipient_user_id IS NULL) — see DATA_DICTIONARY.md's notifications table.
notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, system, category, title, message, read, lead_id, link, created_at
       FROM notifications
       WHERE recipient_user_id IS NULL OR recipient_user_id = $1
       ORDER BY created_at DESC`,
      [req.user!.sub]
    );
    sendOk(res, rows);
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
