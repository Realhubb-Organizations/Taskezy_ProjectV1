import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { query } from "../../db/pool";

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth);

// Reads the attendance_view (schema.sql) — a derived VIEW over timesheet_logs,
// not a stored table. See DATA_DICTIONARY.md for why: storing a parallel
// summary table would drift out of sync with the actual punch records.
attendanceRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT user_id, employee_name, email, designation, present_days, total_days, on_time_days, late_days
       FROM attendance_view ORDER BY employee_name`
    );
    sendOk(res, rows);
  })
);
