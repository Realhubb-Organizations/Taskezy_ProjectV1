// Sales-agent dashboard "Pending Tasks" — one queue of everything the agent
// still owes an action on, bucketed by how urgent it is:
//   upcoming — due in the future
//   pending  — due now; still inside the grace window before it's missed
//   missed   — past the grace window with no action taken
// The 10-minute window matches the backend's follow-up SLA
// (Taskezy-Server/src/jobs/followupScheduler.ts VIOLATION_WINDOW_MS), which
// flips a follow-up to MISSED after the same delay — this just lets the UI
// reflect that live instead of waiting for the scheduler's next poll.
export const TASK_GRACE_MS = 10 * 60_000;

export type TaskBucket = "missed" | "pending" | "upcoming";

export interface PendingTask {
  id: string;
  leadId?: string;
  dueAt: Date | null;
  bucket: TaskBucket;
  name: string;
  phone: string;
  email: string;
  status: string; // the lead's current status, or the call type when the follow-up isn't linked to a lead
  feedback: string;
  taskType: string; // follow-up call type (Callback / Meeting / Site Visit), or the lead status that makes it a task
  assignedTo: string;
  isDataCalling: boolean; // a Data Calling lead (source "Bulk Upload") rather than a Leads one
}

// The server-fetched, not-yet-bucketed shape (AppContext.tsx's pendingTasks,
// from GET /api/v1/tasks/pending) — see Taskezy-Server/src/modules/tasks/
// tasks.routes.ts, which merges open follow-ups + actionable-status leads
// with no open follow-up server-side (the same two-source logic
// buildSalesPendingTasks used to run itself over the full bulk leads/
// followupCalls arrays). Only bucketing is left client-side, below — it
// needs to update live every 30s against the current time, which is cheap
// to keep doing locally and not worth a 30s poll loop against the server.
export interface PendingTaskRaw {
  id: string;
  leadId?: string;
  dueAt: string | null;
  forceMissed: boolean; // a follow-up the scheduler already flipped to MISSED
  name: string;
  phone: string;
  email: string;
  status: string;
  feedback: string;
  taskType: string;
  assignedTo: string;
  isDataCalling?: boolean;
}

const toDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

const bucketFor = (dueAt: Date | null, now: Date): TaskBucket => {
  if (!dueAt) return "missed";
  const overdueBy = now.getTime() - dueAt.getTime();
  if (overdueBy < 0) return "upcoming";
  return overdueBy <= TASK_GRACE_MS ? "pending" : "missed";
};

// Buckets + sorts the server-fetched raw task list — the client-side half
// of what buildSalesPendingTasks used to do entirely itself. Called with a
// fresh `now` every ~30s by each consumer so a task's bucket transitions
// live without needing to refetch from the server.
export function applyTaskBuckets(rawTasks: PendingTaskRaw[], now: Date): PendingTask[] {
  const tasks: PendingTask[] = rawTasks.map(r => {
    const dueAt = toDate(r.dueAt);
    return {
      id: r.id,
      leadId: r.leadId,
      dueAt,
      bucket: r.forceMissed ? "missed" : bucketFor(dueAt, now),
      name: r.name,
      phone: r.phone,
      email: r.email,
      status: r.status,
      feedback: r.feedback,
      taskType: r.taskType,
      assignedTo: r.assignedTo,
      isDataCalling: r.isDataCalling === true
    };
  });

  // Missed first (most recent first), then pending and upcoming (soonest first).
  const order: Record<TaskBucket, number> = { missed: 0, pending: 1, upcoming: 2 };
  return tasks.sort((a, b) => {
    if (a.bucket !== b.bucket) return order[a.bucket] - order[b.bucket];
    const at = a.dueAt?.getTime() ?? 0;
    const bt = b.dueAt?.getTime() ?? 0;
    return a.bucket === "missed" ? bt - at : at - bt;
  });
}
