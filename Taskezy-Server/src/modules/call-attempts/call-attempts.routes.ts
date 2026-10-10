import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query, withTransaction } from "../../db/pool";
import { insertLeadLog } from "../leads/leads.repository";
import * as usersRepo from "../users/users.repository";

export const callAttemptsRouter = Router();

callAttemptsRouter.use(requireAuth);

const SELECT = `
  SELECT id, lead_id, caller_user_id, channel, started_at, ended_at, duration_seconds, status, outcome, notes, created_at
  FROM call_attempts
`;

// CALL: created the moment the native call-state listener (CallStatePlugin)
// fires callEnded — before the blocking feedback modal even renders, so the
// PENDING_FEEDBACK row exists even if the app is force-quit right after the
// call. WHATSAPP: created the moment the agent returns to Taskezy after the
// WhatsApp button opened wa.me (no durationSeconds — there's no "message
// sent" signal to time). Either way, leadId/startedAt come from the
// frontend's own record of what it was doing — the native plugin only
// knows "a call just ended", not which lead it was for.
const createCallAttemptSchema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(["CALL", "WHATSAPP"]).default("CALL"),
  startedAt: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional()
});

// Same ownership rule as changing a lead's status (leads.service.ts's
// assertStatusChangeAllowed): the lead's own agent, that agent's manager,
// or an admin. Without this, any authenticated caller could POST a
// call_attempt against an arbitrary leadId and later (via PATCH) write a
// fabricated Activity History entry onto a lead they have no real
// relationship to.
async function assertCanLogCallFor(caller: { sub: string; role: string }, leadId: string): Promise<void> {
  const { rows } = await pool.query<{ assigned_agent_id: string }>(`SELECT assigned_agent_id FROM leads WHERE id = $1`, [leadId]);
  if (rows.length === 0) throw ApiError.badRequest("That lead doesn't exist.");
  const assignedAgentId = rows[0].assigned_agent_id;
  if (caller.role === "ADMIN" || assignedAgentId === caller.sub) return;
  const owner = await usersRepo.findById(assignedAgentId);
  if (owner?.manager_id === caller.sub) return;
  throw ApiError.forbidden("You can only log a call for your own or your team's lead.");
}

callAttemptsRouter.post(
  "/",
  validate({ body: createCallAttemptSchema }),
  asyncHandler(async (req, res) => {
    await assertCanLogCallFor(req.user!, req.body.leadId);
    let insertedId: string;
    try {
      const { rows } = await pool.query(
        `INSERT INTO call_attempts (lead_id, caller_user_id, channel, started_at, duration_seconds)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [req.body.leadId, req.user!.sub, req.body.channel, req.body.startedAt ?? null, req.body.durationSeconds ?? null]
      );
      insertedId = rows[0].id;
    } catch (err) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503") {
        throw ApiError.badRequest("That lead doesn't exist.");
      }
      throw err;
    }
    const { rows: created } = await query(`${SELECT} WHERE id = $1`, [insertedId]);
    sendOk(res, created[0], 201);
  })
);

// Checked once on every app load/session-restore — this is what re-shows
// the blocking gate after a force-quit/relaunch mid-feedback, not just
// within the same in-memory session. Only ever returns the CALLER's own
// pending row (never another user's), so no role-based scoping is needed
// beyond "it's yours".
callAttemptsRouter.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `${SELECT} WHERE caller_user_id = $1 AND status = 'PENDING_FEEDBACK' ORDER BY created_at DESC LIMIT 1`,
      [req.user!.sub]
    );
    sendOk(res, rows[0] ?? null);
  })
);

const idParamSchema = z.object({ id: z.string().uuid() });
const submitFeedbackSchema = z.object({
  outcome: z.string().trim().min(1).max(100),
  notes: z.string().trim().min(1).max(2000)
});

// Only the caller who made the call may submit its feedback — this is a
// personal "finish what you started" gate, not something an admin/manager
// submits on someone else's behalf.
callAttemptsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: submitFeedbackSchema }),
  asyncHandler(async (req, res) => {
    const { rows: found } = await pool.query<{ caller_user_id: string; lead_id: string; channel: string; status: string }>(
      `SELECT caller_user_id, lead_id, channel, status FROM call_attempts WHERE id = $1`,
      [req.params.id]
    );
    if (found.length === 0) throw ApiError.notFound("Call attempt not found");
    if (found[0].caller_user_id !== req.user!.sub) throw ApiError.forbidden("You can only submit feedback for your own call.");
    if (found[0].status === "COMPLETED") throw ApiError.badRequest("Feedback was already submitted for this call.");

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE call_attempts SET status = 'COMPLETED', outcome = $1, notes = $2 WHERE id = $3`,
        [req.body.outcome, req.body.notes, req.params.id]
      );
      // Same Activity History mechanism every other lead event uses, so the
      // call/message shows up on the lead's own timeline alongside status
      // changes/notes — attributed to req.user.name automatically, same as
      // every other log entry, which is what tells a manager WHO called or
      // sent the WhatsApp message.
      const label = found[0].channel === "WHATSAPP" ? "WhatsApp message" : "Call";
      await insertLeadLog(client, found[0].lead_id, req.user!.sub, req.user!.name, `${label} outcome: ${req.body.outcome}. Notes: ${req.body.notes}`);
    });

    const { rows: updated } = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
    sendOk(res, updated[0]);
  })
);
