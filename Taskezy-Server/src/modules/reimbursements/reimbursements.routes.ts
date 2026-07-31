import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query } from "../../db/pool";

export const reimbursementsRouter = Router();

reimbursementsRouter.use(requireAuth);

const SELECT = `
  SELECT rc.id, rc.title, rc.claim_type, rc.amount, rc.status, rc.claim_date, rc.agent_id,
         u.first_name || COALESCE(' ' || u.last_name, '') AS agent_name, rc.notes
  FROM reimbursement_claims rc
  JOIN users u ON u.id = rc.agent_id
`;

reimbursementsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`${SELECT} ORDER BY rc.claim_date DESC`);
    sendOk(res, rows);
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
       VALUES ($1,$2,$3,'PENDING',CURRENT_DATE,$4,$5) RETURNING id`,
      [title, claimType, amount, req.user!.sub, notes ?? null]
    );
    const { rows: created } = await query(`${SELECT} WHERE rc.id = $1`, [rows[0].id]);
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
    sendOk(res, updated[0]);
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
    sendOk(res, updated[0]);
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
