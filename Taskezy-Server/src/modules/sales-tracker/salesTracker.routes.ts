import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { query } from "../../db/pool";
import { hasSalesTrackerAccess } from "../../config/salesTracker";
import * as service from "./salesTracker.service";

export const salesTrackerRouter = Router();

salesTrackerRouter.use(requireAuth);

// Only the Sales Tracker accounts (config/salesTracker.ts) — the access
// token carries no email, so it's looked up per request (one PK read).
salesTrackerRouter.use(
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const { rows } = await query<{ email: string }>(`SELECT email FROM users WHERE id = $1 AND status = 'ACTIVE'`, [req.user!.sub]);
    if (!hasSalesTrackerAccess(rows[0]?.email)) throw ApiError.forbidden("You don't have access to the Sales Tracker.");
    next();
  })
);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
// BASIC / NRI / AOP or one added in the tracker (checked in the service).
const brokerageType = z.string().trim().min(1).max(50);
const taxType = z.enum(["IGST", "CGST_SGST"]).nullable().optional();
// Multi-value filters arrive as "a,b,c".
const csv = <T extends z.ZodTypeAny>(item: T) =>
  z
    .string()
    .optional()
    .transform(v => (v ? v.split(",").map(s => s.trim()).filter(Boolean) : undefined))
    .pipe(z.array(item).optional());

const filtersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  propertyId: csv(z.string().uuid()),
  salespersonId: csv(z.string().uuid()),
  brokerageType: csv(brokerageType),
  status: csv(z.string().max(40)),
  from: isoDate.optional(),
  to: isoDate.optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional()
});

const listSchema = filtersSchema.extend({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(1000).default(10),
  openOnly: z.enum(["true", "false"]).optional().transform(v => v === "true"),
  invoiceMonth: z.string().regex(/^\d{4}-\d{2}$/).optional()
});

type ListQuery = z.infer<typeof listSchema>;

const idParams = z.object({ id: z.string().uuid() });

const money = z.coerce.number().positive().max(1e12);
const percentage = z.coerce.number().positive().max(100);

// --- Lookups ---------------------------------------------------------------

salesTrackerRouter.get(
  "/lookups",
  asyncHandler(async (_req, res) => {
    sendOk(res, await service.listLookups());
  })
);

salesTrackerRouter.get(
  "/leads",
  asyncHandler(async (_req, res) => {
    sendOk(res, await service.listBookedLeads());
  })
);

// A property type or brokerage type typed in by hand, saved for next time.
salesTrackerRouter.post(
  "/options",
  validate({ body: z.object({ kind: z.enum(["PROPERTY_TYPE", "BROKERAGE_TYPE"]), value: z.string().trim().min(1).max(50) }) }),
  asyncHandler(async (req, res) => {
    await service.addOption(req.body.kind, req.body.value, req.user!.sub);
    sendOk(res, await service.listLookups(), 201);
  })
);

// Booking Approval — approve (→ pickable in Create Booking) or reject a Booked lead.
for (const [path, decision] of [["approve", "APPROVED"], ["reject", "REJECTED"]] as const) {
  salesTrackerRouter.post(
    `/leads/:id/${path}`,
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      await service.decideBooking(req.params.id, decision, { id: req.user!.sub, name: req.user!.name });
      sendOk(res, { decision });
    })
  );
}

// --- Overview --------------------------------------------------------------

salesTrackerRouter.get(
  "/summary",
  validate({ query: filtersSchema }),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.getSummary(req.query as unknown as service.TrackerFilters));
  })
);

// --- Bookings --------------------------------------------------------------

const bookingSchema = z
  .object({
    leadId: z.string().uuid(),
    propertyId: z.string().uuid(),
    salespersonId: z.string().uuid(),
    bhkType: z.string().trim().min(1).max(50),
    unitNumber: z.string().trim().min(1).max(50),
    agreementValue: money,
    brokerageType: z.array(brokerageType).min(1).max(20).transform(v => Array.from(new Set(v))),
    cashback: z.boolean(),
    cashbackAmount: z.coerce.number().nonnegative().max(1e12).nullable().optional(),
    bookingDate: isoDate,
    propertyArea: z.coerce.number().positive().max(1e7).nullable().optional(),
    source: z.string().trim().max(100).nullable().optional()
  })
  .refine(v => !v.cashback || (v.cashbackAmount != null && v.cashbackAmount > 0), {
    message: "Enter the cashback amount",
    path: ["cashbackAmount"]
  });

salesTrackerRouter.get(
  "/bookings",
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListQuery;
    const { rows, totalCount } = await service.listBookings(q as service.TrackerFilters, q.page, q.pageSize);
    sendPaginated(res, rows, { page: q.page, pageSize: q.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / q.pageSize)) });
  })
);

salesTrackerRouter.get(
  "/bookings/:id",
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    sendOk(res, await service.getBooking(req.params.id));
  })
);

salesTrackerRouter.post(
  "/bookings",
  validate({ body: bookingSchema }),
  asyncHandler(async (req, res) => {
    const id = await service.createBooking(req.body, req.user!.sub);
    sendOk(res, await service.getBooking(id), 201);
  })
);

salesTrackerRouter.patch(
  "/bookings/:id",
  validate({ params: idParams, body: bookingSchema }),
  asyncHandler(async (req, res) => {
    await service.updateBooking(req.params.id, req.body);
    sendOk(res, await service.getBooking(req.params.id));
  })
);

salesTrackerRouter.post(
  "/bookings/:id/cancel",
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await service.cancelBooking(req.params.id, req.user!.sub);
    sendOk(res, await service.getBooking(req.params.id));
  })
);

// --- Brokerage details -----------------------------------------------------

const brokerageSchema = z.object({
  items: z
    .array(z.object({ type: brokerageType, percentage, value: money }))
    .min(1)
    .max(20)
    .refine(items => new Set(items.map(i => i.type)).size === items.length, "Each brokerage type can be added only once")
});

salesTrackerRouter.put(
  "/bookings/:id/brokerage",
  validate({ params: idParams, body: brokerageSchema }),
  asyncHandler(async (req, res) => {
    await service.saveBrokerage(req.params.id, req.body.items, req.user!.sub);
    sendOk(res, await service.getBooking(req.params.id));
  })
);

salesTrackerRouter.get(
  "/brokerages",
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListQuery;
    const { rows, totalCount } = await service.listBrokerages(q as service.TrackerFilters & { openOnly?: boolean }, q.page, q.pageSize);
    sendPaginated(res, rows, { page: q.page, pageSize: q.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / q.pageSize)) });
  })
);

// --- Payments --------------------------------------------------------------

salesTrackerRouter.get(
  "/payments",
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListQuery;
    const { rows, totalCount } = await service.listPayments(q as service.TrackerFilters, q.page, q.pageSize);
    sendPaginated(res, rows, { page: q.page, pageSize: q.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / q.pageSize)) });
  })
);

salesTrackerRouter.post(
  "/payments",
  validate({
    body: z.object({
      brokerageId: z.string().uuid(),
      percentage,
      value: money,
      invoiceNumber: z.string().trim().min(1, "Enter the invoice number").max(60),
      taxType
    })
  }),
  asyncHandler(async (req, res) => {
    const paymentId = await service.createPayment(req.body, req.user!.sub);
    sendOk(res, { paymentId }, 201);
  })
);

salesTrackerRouter.patch(
  "/payments/:id",
  validate({
    params: idParams,
    body: z.object({
      percentage: percentage.optional(),
      value: money.optional(),
      invoiceNumber: z.string().trim().min(1).max(60).optional(),
      invoiceRaisedDate: isoDate.optional(),
      paymentReceivedDate: isoDate.optional(),
      taxType
    })
  }),
  asyncHandler(async (req, res) => {
    await service.updatePayment(req.params.id, req.body);
    sendOk(res, { updated: true });
  })
);

salesTrackerRouter.post(
  "/payments/:id/advance",
  validate({
    params: idParams,
    body: z.object({
      date: isoDate,
      invoiceNumber: z.string().trim().max(60).optional(),
      // From Invoice Raised: GST Pending, or straight to Completed (default).
      to: z.enum(["GST_PENDING", "COMPLETED"]).optional()
    })
  }),
  asyncHandler(async (req, res) => {
    await service.advancePayment(req.params.id, req.body.date, req.body.invoiceNumber, req.body.to);
    sendOk(res, { updated: true });
  })
);

salesTrackerRouter.post(
  "/payments/:id/reject",
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await service.rejectPayment(req.params.id);
    sendOk(res, { updated: true });
  })
);

salesTrackerRouter.get(
  "/overdue",
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListQuery;
    const { rows, totalCount } = await service.listOverdue(q as service.TrackerFilters & { invoiceMonth?: string }, q.page, q.pageSize);
    sendPaginated(res, rows, { page: q.page, pageSize: q.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / q.pageSize)) });
  })
);
