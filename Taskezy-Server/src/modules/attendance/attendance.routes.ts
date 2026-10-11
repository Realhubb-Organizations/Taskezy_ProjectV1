import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendPaginated } from "../../utils/apiResponse";
import { query } from "../../db/pool";
import { listAttendanceQuerySchema } from "./attendance.schema";
import { findDirectReportIds } from "../users/users.repository";
import { AccessTokenPayload } from "../../utils/tokens";

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth);

// Same three-way split as leads.service.ts's scopeForCaller — duplicated
// rather than imported since that function isn't exported (see call-log's
// and followups' own copies of this same pattern for precedent).
async function scopedUserIdsForCaller(caller: AccessTokenPayload): Promise<string[] | undefined> {
  if (caller.role !== "AGENT") return undefined;
  if (caller.roleType === "MEMBER") return [caller.sub];
  if (caller.roleType === "MANAGER") {
    const reportIds = await findDirectReportIds(caller.sub);
    return [caller.sub, ...reportIds];
  }
  return undefined;
}

// Reads the attendance_view (schema.sql) — a derived VIEW over timesheet_logs,
// not a stored table. See DATA_DICTIONARY.md for why: storing a parallel
// summary table would drift out of sync with the actual punch records.
//
// Real LIMIT/OFFSET page over that view instead of every employee's full
// tally in one unbounded query — same page/pageSize pattern as
// leads.repository.ts's findMany. Previously had no role-based scoping at
// all (every authenticated caller, including a plain sales Member, saw
// every employee's present/late/on-time tally and email) — now scoped the
// same way as every other self/team/all-records endpoint in this codebase.
attendanceRouter.get(
  "/",
  validate({ query: listAttendanceQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const scopedUserIds = await scopedUserIdsForCaller(req.user!);

    const whereClause = scopedUserIds ? `WHERE user_id = ANY($1::uuid[])` : "";
    const whereParams = scopedUserIds ? [scopedUserIds] : [];

    const countResult = await query<{ count: string }>(`SELECT count(*) FROM attendance_view ${whereClause}`, whereParams);
    const totalCount = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * pageSize;
    const dataParams = [...whereParams, pageSize, offset];
    const { rows } = await query(
      `SELECT user_id, employee_name, email, designation, present_days, total_days, on_time_days, late_days
       FROM attendance_view ${whereClause} ORDER BY employee_name LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    sendPaginated(res, rows, { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) });
  })
);
