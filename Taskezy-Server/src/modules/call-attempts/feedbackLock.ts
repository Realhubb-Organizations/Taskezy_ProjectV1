import { pool } from "../../db/pool";
import { ApiError } from "../../utils/ApiError";

// Pending call feedback held on the lead instead of the whole app.
//
// A call-feedback popup (CallFeedbackGate) normally blocks the agent's app
// until it's filled. When it can't be — the screen stopped responding, or an
// admin/manager force-closed it — the call attempt stays PENDING_FEEDBACK
// with outcome FEEDBACK_PENDING_OUTCOME ("held"): the app is free again, but
// that agent can't act on that one lead until the feedback is given (any
// action there reopens the form, see POST /call-attempts/:id/resume).
// Admins/managers acting on the lead are never blocked.

export const FEEDBACK_PENDING_OUTCOME = "Feedback pending";
/** Held feedback the agent reopened (form showing again) — still noted "(given late)" when filled. */
export const FEEDBACK_REOPENED_OUTCOME = "Feedback pending (reopened)";

/** Activity log lines written when feedback is held — never count as "the agent acted". */
export const FEEDBACK_PENDING_LOG_PREFIX = "Call feedback pending";

/** SQL: this call attempt is held on its lead (alias `ca`, or none). */
export const isHeldSql = (alias = "") => {
  const col = (c: string) => (alias ? `${alias}.${c}` : c);
  // COALESCE: outcome is NULL on an open form, and NULL = '…' would make NOT (…) unknown.
  return `(${col("status")} = 'PENDING_FEEDBACK' AND COALESCE(${col("outcome")}, '') = '${FEEDBACK_PENDING_OUTCOME}')`;
};

export async function findHeldAttempt(callerId: string, leadId: string): Promise<{ id: string; lead_name: string | null } | null> {
  const { rows } = await pool.query<{ id: string; lead_name: string | null }>(
    `SELECT ca.id, l.name AS lead_name
     FROM call_attempts ca
     LEFT JOIN leads l ON l.id = ca.lead_id
     WHERE ca.caller_user_id = $1 AND ca.lead_id = $2 AND ${isHeldSql("ca")}
     ORDER BY ca.created_at DESC
     LIMIT 1`,
    [callerId, leadId]
  );
  return rows[0] ?? null;
}

/**
 * Refuses an action on a lead while the caller still owes call feedback for
 * it. The app reopens that feedback form when it gets this error
 * (code FEEDBACK_PENDING, details.attemptId).
 */
export async function assertNoPendingFeedback(callerId: string, leadId: string): Promise<void> {
  const held = await findHeldAttempt(callerId, leadId);
  if (!held) return;
  throw new ApiError(
    409,
    `Fill the pending call feedback for "${held.lead_name ?? "this lead"}" first.`,
    "FEEDBACK_PENDING",
    { attemptId: held.id }
  );
}
