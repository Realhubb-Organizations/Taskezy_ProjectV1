import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { query } from "../../db/pool";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate";

// Reports page download footprint (migration 052). The CSVs are built in
// the browser, so the page records each download here before saving the
// file; Admins read the list in Reports → Download History.

export const reportExportsRouter = Router();
reportExportsRouter.use(requireAuth);

const recordSchema = z.object({
  report: z.string().trim().min(1).max(200),
  fileName: z.string().trim().max(300).optional(),
  rowCount: z.number().int().min(0).max(10_000_000).optional(),
  // The filters the report was downloaded with (labels, not ids) — shown as-is.
  filters: z.record(z.string().max(100), z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(200)).max(200), z.null()])).optional()
});

// Anyone who can open the Reports page can download (and so is recorded).
reportExportsRouter.post(
  "/exports",
  requireRole("ADMIN", "AGENT"),
  validate({ body: recordSchema }),
  asyncHandler(async (req, res) => {
    const caller = req.user!;
    const { rows: userRows } = await query<{ name: string | null }>(
      `SELECT NULLIF(TRIM(first_name || COALESCE(' ' || last_name, '')), '') AS name FROM users WHERE id = $1`,
      [caller.sub]
    );
    const role = caller.role === "ADMIN" ? "Admin" : caller.roleType === "MANAGER" ? "Manager" : "Member";
    await query(
      `INSERT INTO report_exports (user_id, user_name_snapshot, role_snapshot, report, file_name, row_count, filters)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [caller.sub, userRows[0]?.name ?? caller.name, role, req.body.report, req.body.fileName ?? null, req.body.rowCount ?? null, JSON.stringify(req.body.filters ?? {})]
    );
    sendOk(res, { recorded: true }, 201);
  })
);

const toArray = z.union([z.string(), z.array(z.string())])
  .optional()
  .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v]));

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  userId: z.union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v])),
  report: toArray,
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD").optional()
});

// Admin only: who downloaded what, newest first.
reportExportsRouter.get(
  "/exports",
  requireRole("ADMIN"),
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const params: unknown[] = [];
    const p = (v: unknown) => `$${params.push(v)}`;
    const c: string[] = ["TRUE"];
    if (q.userId?.length) c.push(`e.user_id = ANY(${p(q.userId)}::uuid[])`);
    if (q.report?.length) c.push(`e.report = ANY(${p(q.report)}::text[])`);
    if (q.dateFrom) c.push(`(e.created_at AT TIME ZONE ${p(BUSINESS_TIMEZONE)})::date >= ${p(q.dateFrom)}::date`);
    if (q.dateTo) c.push(`(e.created_at AT TIME ZONE ${p(BUSINESS_TIMEZONE)})::date <= ${p(q.dateTo)}::date`);
    const where = c.join(" AND ");

    const countResult = await query<{ count: string }>(`SELECT count(*) FROM report_exports e WHERE ${where}`, params);
    const totalCount = Number(countResult.rows[0]?.count ?? 0);
    const pageParams = [...params, q.pageSize, (q.page - 1) * q.pageSize];
    const { rows } = await query(
      `SELECT e.id, e.user_id, e.user_name_snapshot AS user_name, e.role_snapshot AS role, e.report, e.file_name,
              e.row_count, e.filters, e.created_at
       FROM report_exports e
       WHERE ${where}
       ORDER BY e.created_at DESC, e.id
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );
    sendPaginated(res, rows, { page: q.page, pageSize: q.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / q.pageSize)) });
  })
);

// Report names for the Download History filter.
reportExportsRouter.get(
  "/exports/reports",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{ report: string }>(`SELECT DISTINCT report FROM report_exports ORDER BY report`);
    sendOk(res, rows.map(r => r.report));
  })
);
