import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { query } from "../../db/pool";
import { recordHeartbeat, getPresence } from "../../utils/presence";
import { describeDevice } from "../auth/loginOtp";

export const presenceRouter = Router();

presenceRouter.use(requireAuth);

const heartbeatSchema = z.object({ active: z.boolean(), deviceLabel: z.string().max(200).optional() });

// Every signed-in user sends this (not just Admins) — Admin is only who can
// *view* the roster below, everyone's own activity is what's reported.
presenceRouter.post(
  "/heartbeat",
  validate({ body: heartbeatSchema }),
  (req, res) => {
    // Web: derive the label from User-Agent, same as login_history/the
    // Devices panel already do (describeDevice's own comment,
    // users.routes.ts's /:id/devices). Native app: the WebView's
    // User-Agent can't tell two phones apart, so the client sends the real
    // captured device name instead (same `${manufacturer} ${model}` string
    // already stored in user_devices.device_name at push-registration time
    // — see layout.tsx) — trust it when present, it's just a label.
    const deviceLabel = req.body.deviceLabel || describeDevice(req.headers["user-agent"]);
    recordHeartbeat(req.user!.sub, req.body.active, deviceLabel);
    sendOk(res, { ok: true });
  }
);

// Admin-only live roster — same requireRole gate every other admin-only
// route in this app uses.
presenceRouter.get(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{ id: string; name: string; role: string }>(
      `SELECT id, first_name || COALESCE(' ' || last_name, '') AS name, role
       FROM users WHERE status = 'ACTIVE' ORDER BY first_name`
    );
    const data = rows.map((u) => {
      const { status, lastActiveAt } = getPresence(u.id);
      return { userId: u.id, name: u.name, role: u.role, status, lastActiveAt };
    });
    sendOk(res, data);
  })
);
