import { pool } from "../../db/pool";
import { ApiError } from "../../utils/ApiError";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate";

// Each lead gets its own time slot: one salesperson can't have two leads'
// calls in the same slot. A new or rescheduled time within SLOT_MS of another
// lead's open call for the same person is refused, with the nearest free
// time suggested. Same rule as the popups' own check (frontend
// lib/duplicateFollowupCheck.ts), enforced here so it holds whichever screen
// or app version schedules the call. Moving a lead within its own slot is fine.

const SLOT_MS = 5 * 60 * 1000;

export interface ScheduleConflict {
  leadName: string;
  at: Date;
  /** Nearest free time after the picked one (slot steps), or null if none in the next 24h. */
  suggestedAt: Date | null;
}

export async function findScheduleConflict(agentId: string, scheduledAt: Date, excludeLeadId?: string | null): Promise<ScheduleConflict | null> {
  const windowEnd = new Date(scheduledAt.getTime() + 24 * 3600 * 1000);
  const { rows } = await pool.query<{ lead_name: string; scheduled_at: Date }>(
    `SELECT fc.lead_name, fc.scheduled_at
     FROM followup_calls fc
     WHERE fc.assigned_to_id = $1 AND fc.status = 'UPCOMING'
       AND ($2::uuid IS NULL OR fc.lead_id IS DISTINCT FROM $2::uuid)
       AND fc.scheduled_at > $3 AND fc.scheduled_at < $4`,
    [agentId, excludeLeadId ?? null, new Date(scheduledAt.getTime() - SLOT_MS), new Date(windowEnd.getTime() + SLOT_MS)]
  );
  const taken = rows.map(r => ({ name: r.lead_name, t: new Date(r.scheduled_at).getTime() }));
  const clashAt = (t: number) => taken.find(x => Math.abs(x.t - t) < SLOT_MS);
  const clash = clashAt(scheduledAt.getTime());
  if (!clash) return null;
  let suggestedAt: Date | null = null;
  for (let t = scheduledAt.getTime() + SLOT_MS; t <= windowEnd.getTime(); t += SLOT_MS) {
    if (!clashAt(t)) { suggestedAt = new Date(t); break; }
  }
  return { leadName: clash.name, at: new Date(clash.t), suggestedAt };
}

const when = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: BUSINESS_TIMEZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Refuses the time (409 SCHEDULE_CONFLICT) when it clashes with another lead's call for the same person. */
export async function assertNoScheduleConflict(agentId: string, scheduledAt: Date, excludeLeadId?: string | null): Promise<void> {
  const conflict = await findScheduleConflict(agentId, scheduledAt, excludeLeadId);
  if (!conflict) return;
  const tip = conflict.suggestedAt ? ` ${when(conflict.suggestedAt)} is free.` : "";
  throw new ApiError(
    409,
    `"${conflict.leadName}" is already scheduled at ${when(conflict.at)}. Each lead needs its own time slot, so pick another time.${tip}`,
    "SCHEDULE_CONFLICT",
    { suggestedAt: conflict.suggestedAt?.toISOString() ?? null }
  );
}
