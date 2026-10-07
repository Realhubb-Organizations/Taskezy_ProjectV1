import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query } from "../../db/pool";
import { businessToday } from "../../utils/businessDate";
import { createNotification } from "../notifications/notifications.service";
import { listActiveAdminAndFinanceIds } from "../users/users.repository";

export const reimbursementsRouter = Router();

reimbursementsRouter.use(requireAuth);

const SELECT = `
  SELECT rc.id, rc.title, rc.claim_type, rc.amount, rc.status, rc.claim_date, rc.agent_id,
         u.first_name || COALESCE(' ' || u.last_name, '') AS agent_name, rc.notes
  FROM reimbursement_claims rc
  JOIN users u ON u.id = rc.agent_id
`;

// Finance page's Reimbursements tab had no page-size control of its own
// before this fix (the whole `reimbursement_claims` table was rendered
// unconditionally from AppContext's bulk load, filtered only client-side).
// 10 is this codebase's own convention for a table's first page absent a
// pre-existing control (see TablePagination's
// DEFAULT_ROWS_PER_PAGE_OPTIONS[0] and usePagination's own default), not a
// number carried over from existing Finance UI. `status` mirrors the tab's
// existing All/Pending/Paid/Rejected filter buttons, moved server-side.
const listReimbursementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(10),
  status: z.enum(["PENDING", "PAID", "REJECTED"]).optional()
});

reimbursementsRouter.get(
  "/",
  validate({ query: listReimbursementsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, status } = req.query as unknown as { page: number; pageSize: number; status?: "PENDING" | "PAID" | "REJECTED" };
    const whereClause = status ? `WHERE rc.status = $1` : "";
    const countParams: unknown[] = status ? [status] : [];
    const countResult = await query<{ count: string }>(`SELECT count(*) FROM reimbursement_claims rc ${whereClause}`, countParams);
    const totalCount = Number(countResult.rows[0]?.count ?? 0);
    const offset = (page - 1) * pageSize;
    const dataParams = [...countParams, pageSize, offset];
    const { rows } = await query(
      `${SELECT} ${whereClause} ORDER BY rc.claim_date DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    sendPaginated(res, rows, { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) });
  })
);

const createClaimSchema = z.object({
  title: z.string().trim().min(1).max(300),
  claimType: z.string().trim().min(1).max(100),
  amount: z.number().positive(),
  notes: z.string().max(2000).optional()
});

reimbursementsRouter.post(
  "/",
  validate({ body: createClaimSchema }),
  asyncHandler(async (req, res) => {
    // agent_id is always the caller, never taken from the request body — a
    // user can only ever submit a claim as themselves, not on someone else's behalf.
    const { title, claimType, amount, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO reimbursement_claims (title, claim_type, amount, status, claim_date, agent_id, notes)
       VALUES ($1,$2,$3,'PENDING',$4,$5,$6) RETURNING id`,
      [title, claimType, amount, businessToday(), req.user!.sub, notes ?? null]
    );
    const { rows: created } = await query(`${SELECT} WHERE rc.id = $1`, [rows[0].id]);

    const recipientIds = await listActiveAdminAndFinanceIds();
    await Promise.all(
      recipientIds
        .filter(id => id !== req.user!.sub)
        .map(id => createNotification({
          system: "FINANCE",
          category: "CLAIM",
          title: "New Reimbursement Claim",
          message: `${req.user!.name} submitted a claim: "${title}" (₹${amount.toLocaleString("en-IN")}).`,
          recipientUserId: id,
          link: "/dashboard/finance?tab=reimbursements"
        }))
    );

    sendOk(res, created[0], 201);
  })
);

const idParamSchema = z.object({ id: z.string().uuid() });

// Approve/reject are restricted to ADMIN/FINANCE — matches the frontend's
// Finance-module-only claim review workflow.
reimbursementsRouter.patch(
  "/:id/approve",
  requireRole("ADMIN", "FINANCE"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE reimbursement_claims SET status = 'PAID' WHERE id = $1 AND status = 'PENDING' RETURNING id`,
      [req.params.id]
    );
    if (rows.length === 0) throw ApiError.notFound("Pending claim not found");
    const { rows: updated } = await query(`${SELECT} WHERE rc.id = $1`, [req.params.id]);
    const claim = updated[0];
    await createNotification({
      system: "FINANCE",
      category: "CLAIM",
      title: "Claim Approved",
      message: `Your claim "${claim.title}" (₹${Number(claim.amount).toLocaleString("en-IN")}) was approved.`,
      recipientUserId: String(claim.agent_id),
      link: "/dashboard/finance?tab=reimbursements"
    });
    sendOk(res, claim);
  })
);

reimbursementsRouter.patch(
  "/:id/reject",
  requireRole("ADMIN", "FINANCE"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE reimbursement_claims SET status = 'REJECTED' WHERE id = $1 AND status = 'PENDING' RETURNING id`,
      [req.params.id]
    );
    if (rows.length === 0) throw ApiError.notFound("Pending claim not found");
    const { rows: updated } = await query(`${SELECT} WHERE rc.id = $1`, [req.params.id]);
    const claim = updated[0];
    await createNotification({
      system: "FINANCE",
      category: "CLAIM",
      title: "Claim Rejected",
      message: `Your claim "${claim.title}" (₹${Number(claim.amount).toLocaleString("en-IN")}) was rejected.`,
      recipientUserId: String(claim.agent_id),
      link: "/dashboard/finance?tab=reimbursements"
    });
    sendOk(res, claim);
  })
);

reimbursementsRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM reimbursement_claims WHERE id = $1`, [req.params.id]);
    if (!rowCount) throw ApiError.notFound("Claim not found");
    sendOk(res, { deleted: true });
  })
);
