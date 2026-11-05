import { FEEDBACK_PENDING_LOG_PREFIX } from "../call-attempts/feedbackLock";

// A lead's task time — the ONE rule behind both Pending Tasks
// (GET /tasks/pending) and the Leads tables' Next Call Date (task_due_at on
// GET /leads), so the two always show the same date and time.
//
//  1. The lead has an open scheduled call → that call's time. With several
//     open calls (older data), the latest overdue one, else the soonest
//     upcoming one — and only that one becomes a task.
//  2. No open call:
//       last action was a WhatsApp message → no task (NULL)
//       New Lead                   → when it was assigned (or created)
//       RNR / Call Back / Followup → its last activity
//       anything else              → no task (NULL)

/** ORDER BY for picking a lead's one open call (alias `f`): latest overdue first, else soonest upcoming. */
export const OPEN_CALL_ORDER_SQL = (f: string) =>
  `(${f}.status = 'MISSED' OR ${f}.scheduled_at < now()) DESC,
   CASE WHEN ${f}.status = 'MISSED' OR ${f}.scheduled_at < now() THEN ${f}.scheduled_at END DESC,
   ${f}.scheduled_at ASC, ${f}.id`;

/** The lead's latest activity line (alias `l`), ignoring the automatic "Call feedback pending" notes. */
const LATEST_LOG_SQL = (col: "created_at" | "message") =>
  `(SELECT ll.${col} FROM lead_logs ll
     WHERE ll.lead_id = l.id AND ll.message NOT LIKE '${FEEDBACK_PENDING_LOG_PREFIX}%'
     ORDER BY ll.created_at DESC LIMIT 1)`;

/** The task time of lead `l` (timestamptz, NULL = no task). */
export const TASK_DUE_AT_SQL = `COALESCE(
  (SELECT f.scheduled_at FROM followup_calls f
    WHERE f.lead_id = l.id AND f.status <> 'COMPLETED'
    ORDER BY ${OPEN_CALL_ORDER_SQL("f")}
    LIMIT 1),
  CASE
    WHEN COALESCE(${LATEST_LOG_SQL("message")}, '') LIKE 'WhatsApp message outcome:%' THEN NULL
    WHEN l.status_code = 'NEW_LEAD' THEN COALESCE(l.assigned_at, l.created_at)
    WHEN l.status_code IN ('RNR', 'CALL_BACK', 'FOLLOWUP') THEN COALESCE(${LATEST_LOG_SQL("created_at")}, l.created_at)
  END
)`;

/** A New Lead's first call is overdue only once Pending Tasks marks it Missed — the same 10 minutes (frontend lib/salesPendingTasks.ts TASK_GRACE_MS). */
export const NEW_LEAD_TASK_GRACE_MINUTES = 10;

/** Lead `l`'s task is the New Lead first call (rule 2, no open scheduled call). */
export const TASK_IS_NEW_LEAD_SQL = `(l.status_code = 'NEW_LEAD' AND NOT EXISTS (
  SELECT 1 FROM followup_calls f WHERE f.lead_id = l.id AND f.status <> 'COMPLETED'
))`;

/** Lead `l`'s Next Call Date has passed (red OVERDUE) — a New Lead first call only after its grace. */
export const TASK_OVERDUE_SQL = `(${TASK_DUE_AT_SQL} + CASE WHEN ${TASK_IS_NEW_LEAD_SQL} THEN interval '${NEW_LEAD_TASK_GRACE_MINUTES} minutes' ELSE interval '0' END) < now()`;
