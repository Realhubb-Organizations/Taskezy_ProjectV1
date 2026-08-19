import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query } from "../../db/pool";
import { createNotification } from "../notifications/notifications.service";
import { listActiveAdminIds } from "../users/users.repository";

export const timesheetsRouter = Router();

timesheetsRouter.use(requireAuth);

const SELECT = `
  SELECT t.id, t.user_id, u.first_name || COALESCE(' ' || u.last_name, '') AS user_name,
         t.work_date, t.punch_in, t.punch_out, t.punch_in_lat, t.punch_in_lng,
         t.duration_hours, t.status,
         r.id AS regularization_id, r.requested_in, r.requested_out, r.reason, r.submitted_at
  FROM timesheet_logs t
  JOIN users u ON u.id = t.user_id
  LEFT JOIN timesheet_regularization_requests r ON r.timesheet_id = t.id AND r.decision = 'PENDING'
`;

// Sales/HR staff only ever see their own punch history; ADMIN/FINANCE see
// everyone's — mirrors the read-scoping already enforced on leads.
timesheetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const isManager = req.user!.role === "ADMIN" || req.user!.role === "FINANCE";
    const { rows } = isManager
      ? await query(`${SELECT} ORDER BY t.work_date DESC`)
      : await query(`${SELECT} WHERE t.user_id = $1 ORDER BY t.work_date DESC`, [req.user!.sub]);
    sendOk(res, rows);
  })
);

const punchInSchema = z.object({
  lat: z.number(),
  lng: z.number()
});

timesheetsRouter.post(
  "/punch-in",
  validate({ body: punchInSchema }),
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.body;
    const now = new Date();
    const workDate = now.toISOString().split("T")[0];

    const { rows: existing } = await pool.query(
      `SELECT id FROM timesheet_logs WHERE user_id = $1 AND work_date = $2`,
      [req.user!.sub, workDate]
    );
    if (existing.length > 0) {
      throw ApiError.conflict("You have already punched in today.");
    }

    const { rows } = await pool.query(
      `INSERT INTO timesheet_logs (user_id, work_date, punch_in, punch_in_lat, punch_in_lng, status)
       VALUES ($1, $2, $3, $4, $5, 'HALF_DAY') RETURNING id`,
      [req.user!.sub, workDate, now, lat, lng]
    );
    const { rows: created } = await query(`${SELECT} WHERE t.id = $1`, [rows[0].id]);
    sendOk(res, created[0], 201);
  })
);

timesheetsRouter.patch(
  "/punch-out",
  asyncHandler(async (req, res) => {
    const workDate = new Date().toISOString().split("T")[0];
    const { rows: open } = await pool.query(
      `SELECT id, punch_in FROM timesheet_logs WHERE user_id = $1 AND work_date = $2 AND punch_out IS NULL`,
      [req.user!.sub, workDate]
    );
    if (open.length === 0) throw ApiError.badRequest("No active shift found to punch out.");

    // FULL_DAY threshold (>= 4 hours) mirrors the frontend's punchOut logic —
    // duration_hours itself is a generated column, but the status bucket it
    // maps to is a business rule, so it's set here, not in the schema.
    const { rows: updated } = await pool.query(
      `UPDATE timesheet_logs
       SET punch_out = now(),
           status = (CASE WHEN EXTRACT(EPOCH FROM (now() - punch_in)) / 3600.0 >= 4.0 THEN 'FULL_DAY' ELSE 'HALF_DAY' END)::timesheet_status
       WHERE id = $1
       RETURNING id`,
      [open[0].id]
    );
    const { rows: result } = await query(`${SELECT} WHERE t.id = $1`, [updated[0].id]);
    sendOk(res, result[0]);
  })
);

const idParamSchema = z.object({ id: z.string().uuid() });
const regularizeSchema = z.object({
  requestedIn: z.string().datetime(),
  requestedOut: z.string().datetime(),
  reason: z.string().trim().min(1).max(500)
});

timesheetsRouter.post(
  "/:id/regularize",
  validate({ params: idParamSchema, body: regularizeSchema }),
  asyncHandler(async (req, res) => {
    const { rows: owned } = await pool.query(
      `SELECT id FROM timesheet_logs WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.sub]
    );
    if (owned.length === 0) throw ApiError.notFound("Timesheet not found");

    const { requestedIn, requestedOut, reason } = req.body;
    await pool.query(
      `INSERT INTO timesheet_regularization_requests (timesheet_id, requested_in, requested_out, reason)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, requestedIn, requestedOut, reason]
    );
    await pool.query(`UPDATE timesheet_logs SET status = 'REGULARIZATION_PENDING' WHERE id = $1`, [req.params.id]);

    const { rows: result } = await query(`${SELECT} WHERE t.id = $1`, [req.params.id]);

    const adminIds = await listActiveAdminIds();
    await Promise.all(
      adminIds.map(id => createNotification({
        system: "HRMS",
        category: "REGULARIZATION",
        title: "Regularization Request",
        message: `${req.user!.name} submitted an attendance regularization request: "${reason}".`,
        recipientUserId: id,
        link: "/dashboard/hrms"
      }))
    );

    sendOk(res, result[0], 201);
  })
);

// Approving/rejecting attendance corrections is ADMIN-only — matches the
// frontend's "Audit Verification" panel, which only ever renders for admins.
timesheetsRouter.patch(
  "/:id/regularize/approve",
  requireRole("ADMIN"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows: pending } = await pool.query(
      `SELECT id, requested_in, requested_out FROM timesheet_regularization_requests
       WHERE timesheet_id = $1 AND decision = 'PENDING'`,
      [req.params.id]
    );
    if (pending.length === 0) throw ApiError.notFound("No pending regularization request found");

    await pool.query(
      `UPDATE timesheet_regularization_requests SET decision = 'APPROVED', decided_by_id = $1, decided_at = now() WHERE id = $2`,
      [req.user!.sub, pending[0].id]
    );
    await pool.query(
      `UPDATE timesheet_logs
       SET punch_in = $1, punch_out = $2, status = 'REGULARIZED'
       WHERE id = $3`,
      [pending[0].requested_in, pending[0].requested_out, req.params.id]
    );

    const { rows: result } = await query(`${SELECT} WHERE t.id = $1`, [req.params.id]);
    await createNotification({
      system: "HRMS",
      category: "REGULARIZATION",
      title: "Regularization Approved",
      message: "Your attendance regularization request was approved.",
      recipientUserId: String(result[0].user_id),
      link: "/dashboard/hrms"
    });
    sendOk(res, result[0]);
  })
);

timesheetsRouter.patch(
  "/:id/regularize/reject",
  requireRole("ADMIN"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows: pending } = await pool.query(
      `SELECT id FROM timesheet_regularization_requests WHERE timesheet_id = $1 AND decision = 'PENDING'`,
      [req.params.id]
    );
    if (pending.length === 0) throw ApiError.notFound("No pending regularization request found");

    await pool.query(
      `UPDATE timesheet_regularization_requests SET decision = 'REJECTED', decided_by_id = $1, decided_at = now() WHERE id = $2`,
      [req.user!.sub, pending[0].id]
    );
    await pool.query(
      `UPDATE timesheet_logs
       SET status = (CASE WHEN duration_hours >= 4.0 THEN 'FULL_DAY' ELSE 'HALF_DAY' END)::timesheet_status
       WHERE id = $1`,
      [req.params.id]
    );

    const { rows: result } = await query(`${SELECT} WHERE t.id = $1`, [req.params.id]);
    await createNotification({
      system: "HRMS",
      category: "REGULARIZATION",
      title: "Regularization Rejected",
      message: "Your attendance regularization request was rejected.",
      recipientUserId: String(result[0].user_id),
      link: "/dashboard/hrms"
    });
    sendOk(res, result[0]);
  })
);
