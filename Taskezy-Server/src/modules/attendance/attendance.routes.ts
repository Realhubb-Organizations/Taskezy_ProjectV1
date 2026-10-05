import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendPaginated } from "../../utils/apiResponse";
import { query } from "../../db/pool";
import { listAttendanceQuerySchema } from "./attendance.schema";

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth);

// Reads the attendance_view (schema.sql) — a derived VIEW over timesheet_logs,
// not a stored table. See DATA_DICTIONARY.md for why: storing a parallel
// summary table would drift out of sync with the actual punch records.
//
// Now a real LIMIT/OFFSET page over that view instead of every employee's
// full tally in one unbounded query — same page/pageSize pattern as
// leads.repository.ts's findMany. No role-based scoping existed on this
// endpoint before (every authenticated caller saw every employee's summary)
// and that's unchanged here — only how the rows are fetched for display.
attendanceRouter.get(
  "/",
  validate({ query: listAttendanceQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };

    const countResult = await query<{ count: string }>(`SELECT count(*) FROM attendance_view`);
    const totalCount = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * pageSize;
    const { rows } = await query(
      `SELECT user_id, employee_name, email, designation, present_days, total_days, on_time_days, late_days
       FROM attendance_view ORDER BY employee_name LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    sendPaginated(res, rows, { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) });
  })
);
