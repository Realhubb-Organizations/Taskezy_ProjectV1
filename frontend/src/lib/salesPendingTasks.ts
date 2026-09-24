import { Lead, FollowupCall } from "@/context/AppContext";

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
}

// Lead statuses that themselves mean "the agent still has to act on this".
const ACTIONABLE_LEAD_STATUSES = new Set<string>(["New Lead", "New", "New Leads", "RNR", "Call Back", "Follow-ups", "Follow up"]);
const NEW_LEAD_STATUSES = new Set<string>(["New Lead", "New", "New Leads"]);

const toDate = (iso: string | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

const latestLog = (l: Lead) =>
  (l.logs || []).reduce<Lead["logs"][number] | null>(
    (latest, log) => (!latest || new Date(log.timestamp).getTime() > new Date(latest.timestamp).getTime() ? log : latest),
    null
  );

const bucketFor = (dueAt: Date | null, now: Date): TaskBucket => {
  if (!dueAt) return "missed";
  const overdueBy = now.getTime() - dueAt.getTime();
  if (overdueBy < 0) return "upcoming";
  return overdueBy <= TASK_GRACE_MS ? "pending" : "missed";
};

// Any activity logged on the lead at/after the task fell due counts as the
// agent having acted on it.
const actedSince = (lead: Lead | undefined, dueAt: Date | null): boolean => {
  if (!lead || !dueAt) return false;
  return (lead.logs || []).some(log => new Date(log.timestamp).getTime() >= dueAt.getTime());
};

// Works for any scope: the sales dashboard passes one agent's leads/calls,
// the admin/manager dashboard passes everyone's and groups by assignedTo.
export function buildSalesPendingTasks(leads: Lead[], followupCalls: FollowupCall[], now: Date): PendingTask[] {
  const leadById = new Map(leads.map(l => [l.id, l]));
  const leadsWithTask = new Set<string>();
  const tasks: PendingTask[] = [];

  // 1. Scheduled follow-ups (callbacks / meetings / site visits) — the real
  //    task queue. Completed ones are done; everything else is still owed.
  for (const call of followupCalls) {
    if (call.status === "Completed") continue;
    const lead = call.leadId ? leadById.get(call.leadId) : undefined;
    const dueAt = toDate(call.scheduledAt);
    if (dueAt && dueAt.getTime() <= now.getTime() && actedSince(lead, dueAt)) continue;

    const bucket: TaskBucket = call.status === "Missed" ? "missed" : bucketFor(dueAt, now);
    if (lead) leadsWithTask.add(lead.id);
    tasks.push({
      id: `fc-${call.id}`,
      leadId: lead?.id,
      dueAt,
      bucket,
      name: lead?.name || call.leadName,
      phone: lead?.phone || call.phone,
      email: lead?.email || "",
      status: lead?.status || call.type,
      feedback: (lead && latestLog(lead)?.message) || "No feedback yet",
      taskType: call.type,
      assignedTo: call.assignedTo || lead?.assignedAgent || ""
    });
  }

  // 2. Leads sitting in an actionable status with no scheduled follow-up —
  //    due from the moment they entered that state (assignment for a new
  //    lead, the latest logged activity otherwise).
  for (const lead of leads) {
    if (!ACTIONABLE_LEAD_STATUSES.has(lead.status) || leadsWithTask.has(lead.id)) continue;
    const last = latestLog(lead);
    const dueAt = NEW_LEAD_STATUSES.has(lead.status)
      ? toDate(lead.assignedAt) || toDate(lead.createdAtStr)
      : toDate(last?.timestamp) || toDate(lead.createdAtStr);
    tasks.push({
      id: `lead-${lead.id}`,
      leadId: lead.id,
      dueAt,
      bucket: bucketFor(dueAt, now),
      name: lead.name,
      phone: lead.phone,
      email: lead.email || "",
      status: lead.status,
      feedback: last?.message || "No feedback yet",
      taskType: lead.status,
      assignedTo: lead.assignedAgent || ""
    });
  }

  // Missed first (most recent first), then pending and upcoming (soonest first).
  const order: Record<TaskBucket, number> = { missed: 0, pending: 1, upcoming: 2 };
  return tasks.sort((a, b) => {
    if (a.bucket !== b.bucket) return order[a.bucket] - order[b.bucket];
    const at = a.dueAt?.getTime() ?? 0;
    const bt = b.dueAt?.getTime() ?? 0;
    return a.bucket === "missed" ? bt - at : at - bt;
  });
}
