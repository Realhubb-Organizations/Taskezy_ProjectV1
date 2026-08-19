import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query } from "../../db/pool";
import { createNotification } from "../notifications/notifications.service";
import { listActiveAdminAndFinanceIds } from "../users/users.repository";

export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);

const SELECT = `
  SELECT id, invoice_number, lead_id, client_name, base_amount, cgst, sgst, total_amount, status,
         due_date, developer_name, project_name, unit_no, unit_dimension, brokerage_type,
         brokerage_rate, collection_status, collected_amount, created_at
  FROM invoices
`;

/** The lead's assigned agent — invoice generation/payment is meaningful to them, not just Finance. */
async function findLeadAgentId(leadId: string): Promise<string | undefined> {
  const { rows } = await query<{ assigned_agent_id: string }>(`SELECT assigned_agent_id FROM leads WHERE id = $1`, [leadId]);
  return rows[0]?.assigned_agent_id;
}

invoicesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`${SELECT} ORDER BY created_at DESC`);
    sendOk(res, rows);
  })
);

const idParamSchema = z.object({ id: z.string().uuid() });

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}

const createInvoiceSchema = z.object({
  leadId: z.string().uuid(),
  clientName: z.string().min(1),
  baseAmount: z.number().min(0),
  dueDate: z.string().optional(),
  developerName: z.string().optional(),
  projectName: z.string().optional(),
  unitNo: z.string().optional(),
  unitDimension: z.string().optional(),
  brokerageType: z.enum(["PERCENTAGE", "FLAT"]).optional(),
  brokerageRate: z.number().optional()
});

// Creating/generating/marking-paid/deleting invoices is ADMIN/FINANCE-only —
// matches the frontend's Finance-module-only billing workflow.
invoicesRouter.post(
  "/",
  requireRole("ADMIN", "FINANCE"),
  validate({ body: createInvoiceSchema }),
  asyncHandler(async (req, res) => {
    const dueDate = req.body.dueDate ?? new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    let insertedId: string;
    try {
      const { rows } = await pool.query(
        `INSERT INTO invoices (
           lead_id, client_name, base_amount, due_date, developer_name, project_name,
           unit_no, unit_dimension, brokerage_type, brokerage_rate
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          req.body.leadId, req.body.clientName, req.body.baseAmount, dueDate,
          req.body.developerName ?? null, req.body.projectName ?? null, req.body.unitNo ?? null,
          req.body.unitDimension ?? null, req.body.brokerageType ?? null, req.body.brokerageRate ?? null
        ]
      );
      insertedId = rows[0].id;
    } catch (err) {
      if (isForeignKeyViolation(err)) throw ApiError.badRequest("That lead doesn't exist.");
      throw err;
    }
    const { rows: created } = await query(`${SELECT} WHERE id = $1`, [insertedId]);

    const recipientIds = await listActiveAdminAndFinanceIds();
    await Promise.all(
      recipientIds
        .filter(id => id !== req.user!.sub) // no need to notify yourself of your own action
        .map(id => createNotification({
          system: "FINANCE",
          category: "INVOICE",
          title: "New Invoice Created",
          message: `Invoice for ${req.body.clientName} (₹${req.body.baseAmount.toLocaleString("en-IN")}) was created by ${req.user!.name}.`,
          recipientUserId: id,
          link: "/dashboard/finance"
        }))
    );

    sendOk(res, created[0], 201);
  })
);

// Assigns the authoritative invoice number + GST — a separate step from
// payment (see /mark-paid below), not the same action. Retries on a rare
// invoice_number collision instead of surfacing a raw 500.
invoicesRouter.patch(
  "/:id/generate",
  requireRole("ADMIN", "FINANCE"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const MAX_ATTEMPTS = 5;
    let succeeded = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !succeeded; attempt++) {
      const invoiceNumber = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      try {
        const { rows } = await pool.query(
          `UPDATE invoices
           SET invoice_number = $1,
               cgst = ROUND(base_amount * 0.09, 2),
               sgst = ROUND(base_amount * 0.09, 2)
           WHERE id = $2
           RETURNING id`,
          [invoiceNumber, req.params.id]
        );
        if (rows.length === 0) throw ApiError.notFound("Invoice not found");
        succeeded = true;
      } catch (err) {
        if (isUniqueViolation(err) && attempt < MAX_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    const { rows: updated } = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
    const invoice = updated[0];
    const agentId = invoice.lead_id ? await findLeadAgentId(String(invoice.lead_id)) : undefined;
    if (agentId) {
      await createNotification({
        system: "CRM",
        category: "INVOICE",
        title: "Invoice Generated",
        message: `Invoice ${invoice.invoice_number} for ${invoice.client_name} is ready.`,
        recipientUserId: agentId,
        link: "/dashboard/finance"
      });
    }
    sendOk(res, invoice);
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
    const invoice = updated[0];
    const agentId = invoice.lead_id ? await findLeadAgentId(String(invoice.lead_id)) : undefined;
    if (agentId) {
      await createNotification({
        system: "CRM",
        category: "INVOICE",
        title: "Invoice Marked Paid",
        message: `Invoice ${invoice.invoice_number} for ${invoice.client_name} was marked as paid.`,
        recipientUserId: agentId,
        link: "/dashboard/finance"
      });
    }
    sendOk(res, invoice);
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
