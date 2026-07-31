import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query } from "../../db/pool";

export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);

const SELECT = `
  SELECT id, invoice_number, lead_id, client_name, base_amount, cgst, sgst, total_amount, status,
         due_date, developer_name, project_name, unit_no, unit_dimension, brokerage_type,
         brokerage_rate, collection_status, collected_amount, created_at
  FROM invoices
`;

invoicesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`${SELECT} ORDER BY created_at DESC`);
    sendOk(res, rows);
  })
);

const idParamSchema = z.object({ id: z.string().uuid() });

// Generating/marking-paid/deleting invoices is ADMIN/FINANCE-only — matches
// the frontend's Finance-module-only billing workflow.
invoicesRouter.patch(
  "/:id/generate",
  requireRole("ADMIN", "FINANCE"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const invoiceNumber = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const { rows } = await pool.query(
      `UPDATE invoices
       SET invoice_number = $1,
           cgst = ROUND(base_amount * 0.09, 2),
           sgst = ROUND(base_amount * 0.09, 2),
           status = 'PAID'
       WHERE id = $2
       RETURNING id`,
      [invoiceNumber, req.params.id]
    );
    if (rows.length === 0) throw ApiError.notFound("Invoice not found");
    const { rows: updated } = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
    sendOk(res, updated[0]);
  })
);

invoicesRouter.patch(
  "/:id/mark-paid",
  requireRole("ADMIN", "FINANCE"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`UPDATE invoices SET status = 'PAID' WHERE id = $1 RETURNING id`, [req.params.id]);
    if (rows.length === 0) throw ApiError.notFound("Invoice not found");
    const { rows: updated } = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
    sendOk(res, updated[0]);
  })
);

invoicesRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM invoices WHERE id = $1`, [req.params.id]);
    if (!rowCount) throw ApiError.notFound("Invoice not found");
    sendOk(res, { deleted: true });
  })
);
