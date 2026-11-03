import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdminOrManager } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query, withTransaction } from "../../db/pool";
import { insertLeadLog } from "../leads/leads.repository";
import * as usersRepo from "../users/users.repository";
import { boss, SCHEDULE_FOLLOWUP_QUEUE } from "../../jobs/queue";
import { processScheduleFollowup, ScheduleFollowupJobData } from "../../jobs/scheduleFollowupJob";
import { logger } from "../../utils/logger";
import { assertNoScheduleConflict } from "../followups/scheduleConflict";
import { publishToUser } from "../../utils/sseHub";
import { broadcastLeadChanged } from "../leads/leads.realtime";
import { FEEDBACK_PENDING_LOG_PREFIX, FEEDBACK_PENDING_OUTCOME, FEEDBACK_REOPENED_OUTCOME, findHeldAttempt, isHeldSql } from "./feedbackLock";

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
    // Feedback for an earlier call on this lead is still held (feedbackLock.ts):
    // bring that form back instead of starting another — one form covers both.
    const held = await findHeldAttempt(req.user!.sub, req.body.leadId);
    if (held) {
      await pool.query(`UPDATE call_attempts SET outcome = $2 WHERE id = $1`, [held.id, FEEDBACK_REOPENED_OUTCOME]);
      const { rows: resumed } = await query(`${SELECT} WHERE id = $1`, [held.id]);
      sendOk(res, resumed[0]);
      return;
    }
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
      `${SELECT} WHERE caller_user_id = $1 AND status = 'PENDING_FEEDBACK' AND NOT ${isHeldSql()} ORDER BY created_at DESC LIMIT 1`,
      [req.user!.sub]
    );
    sendOk(res, rows[0] ?? null);
  })
);

// The caller's own feedback held on leads (feedbackLock.ts) — shown as a
// "Call feedback pending for …  Fill now" bar until each is filled.
callAttemptsRouter.get(
  "/held",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ca.id, ca.lead_id, l.name AS lead_name, ca.channel, ca.created_at
       FROM call_attempts ca
       LEFT JOIN leads l ON l.id = ca.lead_id
       WHERE ca.caller_user_id = $1 AND ${isHeldSql("ca")}
       ORDER BY ca.created_at`,
      [req.user!.sub]
    );
    sendOk(res, rows);
  })
);

// A WhatsApp follow-up doesn't carry the same weight as a phone call (no
// live conversation to react to), so once an agent has already completed
// WhatsApp feedback for a lead at least once, scheduling a next-call
// date/time on a LATER WhatsApp contact for that same lead becomes
// optional instead of mandatory (see CallFeedbackGate.tsx). Only
// COMPLETED attempts count — an attempt still sitting PENDING_FEEDBACK
// hasn't actually been "handled" yet.
const leadIdParamSchema = z.object({ leadId: z.string().uuid() });
callAttemptsRouter.get(
  "/lead/:leadId/whatsapp-scheduled-before",
  validate({ params: leadIdParamSchema }),
  asyncHandler(async (req, res) => {
    await assertCanLogCallFor(req.user!, req.params.leadId);
    const { rows } = await pool.query(
      `SELECT 1 FROM call_attempts WHERE lead_id = $1 AND channel = 'WHATSAPP' AND status = 'COMPLETED' LIMIT 1`,
      [req.params.leadId]
    );
    sendOk(res, { scheduledBefore: rows.length > 0 });
  })
);

// call_attempts.outcome of a feedback popup closed by an admin/manager (POST /:id/force-complete).
const FORCE_CLOSED_OUTCOME = "Force-closed";

const idParamSchema = z.object({ id: z.string().uuid() });
const submitFeedbackSchema = z.object({
  outcome: z.string().trim().min(1).max(100),
  notes: z.string().trim().min(1).max(2000),
  // Optional next-call date/time (CallFeedbackGate's "Next call date"/
  // "Time" fields) — closing the attempt itself stays synchronous below so
  // the popup unlocks right away; actually scheduling the reminder (the
  // conflict check + create) is queued (see scheduleFollowupJob.ts) so the
  // agent isn't held waiting on it.
  scheduledAt: z.string().datetime().optional(),
  // Asked when a site visit is moved to a new date (Team Reports' Reschedule Reason).
  rescheduleReason: z.string().trim().max(500).optional()
});

// Only the caller who made the call may submit its feedback — this is a
// personal "finish what you started" gate, not something an admin/manager
// submits on someone else's behalf.
callAttemptsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: submitFeedbackSchema }),
  asyncHandler(async (req, res) => {
    const { rows: found } = await pool.query<{ caller_user_id: string; lead_id: string; channel: string; status: string; outcome: string | null }>(
      `SELECT caller_user_id, lead_id, channel, status, outcome FROM call_attempts WHERE id = $1`,
      [req.params.id]
    );
    if (found.length === 0) throw ApiError.notFound("Call attempt not found");
    if (found[0].caller_user_id !== req.user!.sub) throw ApiError.forbidden("You can only submit feedback for your own call.");
    // Already closed. Never refuse here — a refusal left the agent's popup
    // with no way out:
    //  - closed by an admin/manager (Force Close) while the agent still had
    //    the popup open: their real feedback is still taken, below;
    //  - closed by this same feedback a moment ago (a retry, a double tap):
    //    nothing to do again, just let the popup close.
    const lateAfterForceClose = found[0].status === "COMPLETED" && found[0].outcome === FORCE_CLOSED_OUTCOME;
    const late = lateAfterForceClose || found[0].outcome === FEEDBACK_PENDING_OUTCOME || found[0].outcome === FEEDBACK_REOPENED_OUTCOME;
    if (found[0].status === "COMPLETED" && !lateAfterForceClose) {
      const { rows: existing } = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
      sendOk(res, existing[0]);
      return;
    }

    // Each lead needs its own time slot: refuse a next-call time that clashes
    // with another lead's call for the same salesperson BEFORE anything is
    // saved, so the popup stays open to pick another time.
    if (req.body.scheduledAt) {
      const { rows: owner } = await pool.query<{ assigned_agent_id: string }>(`SELECT assigned_agent_id FROM leads WHERE id = $1`, [found[0].lead_id]);
      if (owner[0]) await assertNoScheduleConflict(owner[0].assigned_agent_id, new Date(req.body.scheduledAt), found[0].lead_id);
    }

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
      await insertLeadLog(
        client, found[0].lead_id, req.user!.sub, req.user!.name,
        `${label} outcome: ${req.body.outcome}. Notes: ${req.body.notes}${late ? " (given late)" : ""}`
      );
      // A WhatsApp message asks for no next call, but it is an action on the
      // lead: a call that had already come due is handled by it (so it's
      // never flagged Missed). A call still in the future stays Upcoming.
      if (found[0].channel === "WHATSAPP") {
        await client.query(
          `UPDATE followup_calls SET status = 'COMPLETED' WHERE lead_id = $1 AND status = 'UPCOMING' AND scheduled_at <= now()`,
          [found[0].lead_id]
        );
      }
    });

    if (req.body.scheduledAt) {
      const { rows: leadRows } = await pool.query<{ name: string; phone: string | null; assigned_agent_id: string; status_code: string }>(
        `SELECT name, phone, assigned_agent_id, status_code FROM leads WHERE id = $1`,
        [found[0].lead_id]
      );
      if (leadRows[0]) {
        // The popup saves the status first, so this is the status the agent
        // picked (or kept): a lead in Site Visit Scheduled gets a site visit,
        // not a callback — otherwise the visit never shows in the reports.
        const isSiteVisit = leadRows[0].status_code === "SITE_VISIT_SCHEDULED";
        const schedule: ScheduleFollowupJobData = {
          leadId: found[0].lead_id,
          leadName: leadRows[0].name,
          phone: leadRows[0].phone,
          assignedAgentId: leadRows[0].assigned_agent_id,
          scheduledAt: req.body.scheduledAt,
          callType: isSiteVisit ? "SITE_VISIT" : "CALLBACK",
          rescheduleReason: isSiteVisit ? req.body.rescheduleReason || undefined : undefined
        };
        // Created right away, before answering, so the lead's next task is
        // at the picked time the moment the popup closes. It used to be
        // queued: until the job ran the lead counted as due at its last
        // activity (the call itself, e.g. 3:53 PM), and a screen that had
        // already refreshed kept that task — Pending, then Missed. The queue
        // is now only the fallback if creating it here fails.
        try {
          await processScheduleFollowup(schedule);
        } catch (err) {
          logger.warn({ err, leadId: schedule.leadId }, "Scheduling the next call failed — queued instead");
          await boss.send(SCHEDULE_FOLLOWUP_QUEUE, schedule);
        }
      }
    }

    // The lead's Next Call Date (task_due_at) may have changed — new call, or a WhatsApp closing a due one.
    broadcastLeadChanged(found[0].lead_id);
    const { rows: updated } = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
    sendOk(res, updated[0]);
  })
);

// Admin/Manager-only rescue list: an agent whose device/network keeps them
// from ever successfully submitting the blocking feedback gate has no way
// out of it themselves (by design — see CallFeedbackGate.tsx) and a
// restart doesn't help, since this same PENDING_FEEDBACK row is what
// re-shows the gate. Admin sees every stuck row; a Manager only their own
// direct reports' — mirrors every other "team" scoping in this codebase.
callAttemptsRouter.get(
  "/stuck",
  requireAdminOrManager("view stuck calls"),
  asyncHandler(async (req, res) => {
    const scopeIds = req.user!.role === "ADMIN" ? null : await usersRepo.findDirectReportIds(req.user!.sub);
    const { rows } = await query(
      `SELECT ca.id, ca.lead_id, l.name AS lead_name, ca.caller_user_id,
              u.first_name || COALESCE(' ' || u.last_name, '') AS caller_name,
              ca.channel, ca.created_at
       FROM call_attempts ca
       JOIN users u ON u.id = ca.caller_user_id
       LEFT JOIN leads l ON l.id = ca.lead_id
       WHERE ca.status = 'PENDING_FEEDBACK' AND NOT ${isHeldSql("ca")}
         ${scopeIds ? "AND ca.caller_user_id = ANY($1::uuid[])" : ""}
       ORDER BY ca.created_at ASC`,
      scopeIds ? [scopeIds] : []
    );
    sendOk(res, rows);
  })
);

// Moves a pending feedback off the agent's screen onto its lead (feedbackLock.ts).
async function holdOnLead(attemptId: string, leadId: string, actorId: string, actorName: string, why: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`UPDATE call_attempts SET outcome = $1 WHERE id = $2 AND status = 'PENDING_FEEDBACK'`, [FEEDBACK_PENDING_OUTCOME, attemptId]);
    await insertLeadLog(client, leadId, actorId, actorName, `${FEEDBACK_PENDING_LOG_PREFIX} — ${why}. The agent has to fill it before working on this lead again.`);
  });
}

// The agent's own feedback screen stopped responding (CallFeedbackGate's
// dead-click check): free their app and hold the feedback on the lead.
callAttemptsRouter.post(
  "/:id/hold",
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows: found } = await pool.query<{ caller_user_id: string; lead_id: string; status: string; outcome: string | null }>(
      `SELECT caller_user_id, lead_id, status, outcome FROM call_attempts WHERE id = $1`,
      [req.params.id]
    );
    if (found.length === 0) throw ApiError.notFound("Call attempt not found");
    if (found[0].caller_user_id !== req.user!.sub) throw ApiError.forbidden("You can only do this for your own call.");
    if (found[0].status === "PENDING_FEEDBACK" && found[0].outcome !== FEEDBACK_PENDING_OUTCOME) {
      // (an open or reopened form)
      await holdOnLead(req.params.id, found[0].lead_id, req.user!.sub, req.user!.name, "the feedback screen stopped responding");
    }
    const { rows } = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
    sendOk(res, rows[0]);
  })
);

// Reopens held feedback so the agent can fill it (the app calls this when
// an action on the lead is refused with FEEDBACK_PENDING).
callAttemptsRouter.post(
  "/:id/resume",
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows: found } = await pool.query<{ caller_user_id: string; status: string }>(
      `SELECT caller_user_id, status FROM call_attempts WHERE id = $1`,
      [req.params.id]
    );
    if (found.length === 0) throw ApiError.notFound("Call attempt not found");
    if (found[0].caller_user_id !== req.user!.sub) throw ApiError.forbidden("You can only do this for your own call.");
    if (found[0].status === "PENDING_FEEDBACK") {
      await pool.query(`UPDATE call_attempts SET outcome = $3 WHERE id = $1 AND outcome = $2`, [req.params.id, FEEDBACK_PENDING_OUTCOME, FEEDBACK_REOPENED_OUTCOME]);
    }
    const { rows } = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
    sendOk(res, rows[0]);
  })
);

// Rescues an agent who's genuinely stuck (bad network, a dead end they
// can't resolve from their own device) — marks the call COMPLETED with a
// system-authored outcome instead of the agent's own, same Activity
// History mechanism as a normal submission, so there's no gap in the
// lead's timeline. A Manager may only force-close their own team's calls;
// an Admin may close any.
callAttemptsRouter.post(
  "/:id/force-complete",
  requireAdminOrManager("force-close a stuck call"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows: found } = await pool.query<{ caller_user_id: string; lead_id: string; channel: string; status: string; outcome: string | null }>(
      `SELECT caller_user_id, lead_id, channel, status, outcome FROM call_attempts WHERE id = $1`,
      [req.params.id]
    );
    if (found.length === 0) throw ApiError.notFound("Call attempt not found");
    if (found[0].status === "COMPLETED") throw ApiError.badRequest("This call was already resolved.");
    if (found[0].outcome === FEEDBACK_PENDING_OUTCOME) throw ApiError.badRequest("This call's feedback was already moved to the lead.");
    if (req.user!.role !== "ADMIN") {
      const teamIds = await usersRepo.findDirectReportIds(req.user!.sub);
      if (!teamIds.includes(found[0].caller_user_id)) {
        throw ApiError.forbidden("You can only force-close a call for your own team.");
      }
    }

    // Frees the agent's app, but the feedback is still owed: it's held on
    // the lead (feedbackLock.ts) — the agent can't act on that lead until
    // they give it.
    await holdOnLead(req.params.id, found[0].lead_id, req.user!.sub, req.user!.name, `force-closed by ${req.user!.name}`);
    // Close the popup on the agent's open app right away (AppContext listens).
    publishToUser(found[0].caller_user_id, "call-attempt-resolved", { id: req.params.id });

    const { rows: updated } = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
    sendOk(res, updated[0]);
  })
);
