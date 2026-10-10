import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { pool, query } from "../../db/pool";
import { normalizeIndianMobile } from "../leads/leads.repository";
import * as usersRepo from "../users/users.repository";
import { AccessTokenPayload } from "../../utils/tokens";

export const callLogRouter = Router();

callLogRouter.use(requireAuth);

/**
 * Same three-way split as leads.service.ts's scopeForCaller (Admin/Finance
 * unrestricted, Manager sees self+direct reports, Member sees only self) —
 * duplicated rather than imported because that function isn't exported, and
 * this module's "whose call logs am I allowed to see" question is its own
 * independent check, not something that should silently drift if leads'
 * scoping rule ever changes shape.
 */
async function scopedUserIdsForCaller(caller: AccessTokenPayload): Promise<string[] | undefined> {
  if (caller.role !== "AGENT") return undefined;
  if (caller.roleType === "MEMBER") return [caller.sub];
  if (caller.roleType === "MANAGER") {
    const reportIds = await usersRepo.findDirectReportIds(caller.sub);
    return [caller.sub, ...reportIds];
  }
  return undefined;
}

const callLogEntrySchema = z.object({
  phoneNumber: z.string().trim().min(1).max(32),
  callType: z.enum(["INCOMING", "OUTGOING", "MISSED", "REJECTED", "BLOCKED", "UNKNOWN"]),
  // Not strictly validated as ISO (same convention as call-attempts.routes.ts's
  // startedAt) — passed straight through to Postgres's own timestamptz cast,
  // which is the real validation; a malformed value fails the INSERT.
  callDate: z.string().min(1),
  durationSeconds: z.number().int().nonnegative()
});

// Capped at 500 — a device sync batch, not an unbounded dump. The native app
// re-sends overlapping history on every sync (it has no "already uploaded"
// bookkeeping of its own); ON CONFLICT DO NOTHING below is what makes that
// safe to do repeatedly without duplicating rows.
const syncCallLogSchema = z.object({
  entries: z.array(callLogEntrySchema).max(500)
});

callLogRouter.post(
  "/sync",
  validate({ body: syncCallLogSchema }),
  asyncHandler(async (req, res) => {
    const entries = req.body.entries as Array<{
      phoneNumber: string;
      callType: string;
      callDate: string;
      durationSeconds: number;
    }>;

    if (entries.length === 0) {
      sendOk(res, { received: 0, inserted: 0 }, 201);
      return;
    }

    const userIds = entries.map(() => req.user!.sub);
    // Normalize for lead-matching (see the GET endpoint below), same as
    // every other external phone-number ingest point in this codebase —
    // but a landline or malformed number must still be stored, just
    // unnormalized, rather than dropped from the sync.
    const phoneNumbers = entries.map(e => normalizeIndianMobile(e.phoneNumber) ?? e.phoneNumber.trim());
    const callTypes = entries.map(e => e.callType);
    const callDates = entries.map(e => e.callDate);
    const durations = entries.map(e => e.durationSeconds);

    // Same unnest-backed multi-row INSERT pattern as leads.repository.ts's
    // createBulkLeadsChunk — one round trip for the whole batch instead of
    // one INSERT per entry. ON CONFLICT DO NOTHING relies on the migration's
    // UNIQUE (user_id, phone_number, call_date) constraint to silently skip
    // whatever this device already uploaded in a previous sync.
    const { rows: inserted } = await pool.query(
      `INSERT INTO device_call_log (user_id, phone_number, call_type, call_date, duration_seconds)
       SELECT u, p, t, d, s
       FROM unnest($1::uuid[], $2::text[], $3::text[], $4::timestamptz[], $5::int[]) AS entry(u, p, t, d, s)
       ON CONFLICT (user_id, phone_number, call_date) DO NOTHING
       RETURNING id`,
      [userIds, phoneNumbers, callTypes, callDates, durations]
    );

    sendOk(res, { received: entries.length, inserted: inserted.length }, 201);
  })
);

const listCallLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

// leads.phone is already stored normalized to a bare 10-digit mobile (see
// normalizeIndianMobile's own comment in leads.repository.ts), and
// device_call_log.phone_number is normalized the same way at insert time
// above — so a plain equality join is enough to link a call to a lead by
// phone number, no live re-normalization needed on every query. A number
// that couldn't be normalized (landline/malformed) just won't match any
// lead, which is correct: those were never going to match anyway.
const LIST_SELECT = `
  SELECT
    dcl.id,
    dcl.user_id,
    u.first_name || COALESCE(' ' || u.last_name, '') AS user_name,
    dcl.phone_number,
    l.id AS lead_id,
    l.name AS lead_name,
    dcl.call_type,
    dcl.call_date,
    dcl.duration_seconds
  FROM device_call_log dcl
  JOIN users u ON u.id = dcl.user_id
  LEFT JOIN leads l ON l.phone = dcl.phone_number
`;

callLogRouter.get(
  "/",
  validate({ query: listCallLogQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, dateFrom, dateTo } = req.query as unknown as {
      page: number;
      pageSize: number;
      dateFrom?: string;
      dateTo?: string;
    };

    const scopedUserIds = await scopedUserIdsForCaller(req.user!);

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (scopedUserIds) {
      params.push(scopedUserIds);
      conditions.push(`dcl.user_id = ANY($${params.length}::uuid[])`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`dcl.call_date >= $${params.length}::timestamptz`);
    }
    if (dateTo) {
      params.push(dateTo);
      conditions.push(`dcl.call_date <= $${params.length}::timestamptz`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query<{ count: string }>(`SELECT count(*) FROM device_call_log dcl ${whereClause}`, params);
    const totalCount = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * pageSize;
    const dataParams = [...params, pageSize, offset];
    const { rows } = await query<{
      id: string;
      user_id: string;
      user_name: string;
      phone_number: string;
      lead_id: string | null;
      lead_name: string | null;
      call_type: string;
      call_date: string;
      duration_seconds: number;
    }>(
      `${LIST_SELECT} ${whereClause} ORDER BY dcl.call_date DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const data = rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      phoneNumber: r.phone_number,
      leadId: r.lead_id,
      leadName: r.lead_name,
      callType: r.call_type,
      callDate: new Date(r.call_date).toISOString(),
      durationSeconds: r.duration_seconds
    }));

    sendPaginated(res, data, { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) });
  })
);
