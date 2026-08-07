import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createLeadSchema,
  editLeadSchema,
  leadIdParamSchema,
  listLeadsQuerySchema,
  reassignLeadSchema,
  updateLeadStatusSchema
} from "./leads.schema";
import {
  createLeadHandler,
  deleteLeadHandler,
  editLeadHandler,
  getLeadHandler,
  listLeadsHandler,
  reassignLeadHandler,
  updateLeadStatusHandler,
  verifyLeadKycHandler
} from "./leads.controller";

export const leadsRouter = Router();

leadsRouter.use(requireAuth);

leadsRouter.get("/", validate({ query: listLeadsQuerySchema }), asyncHandler(listLeadsHandler));
leadsRouter.get("/:id", validate({ params: leadIdParamSchema }), asyncHandler(getLeadHandler));
leadsRouter.post("/", validate({ body: createLeadSchema }), asyncHandler(createLeadHandler));
leadsRouter.patch(
  "/:id/status",
  validate({ params: leadIdParamSchema, body: updateLeadStatusSchema }),
  asyncHandler(updateLeadStatusHandler)
);
leadsRouter.patch(
  "/:id",
  validate({ params: leadIdParamSchema, body: editLeadSchema }),
  asyncHandler(editLeadHandler)
);
// Reassign is open to every authenticated role — leads.service.ts enforces
// who can reassign to whom based on reporting line (ADMIN: anyone; Manager:
// own reports; Member: teammates under the same manager). Delete stays
// ADMIN-only — genuinely destructive, no equivalent scoped-down case for it.
leadsRouter.patch(
  "/:id/reassign",
  validate({ params: leadIdParamSchema, body: reassignLeadSchema }),
  asyncHandler(reassignLeadHandler)
);
leadsRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  validate({ params: leadIdParamSchema }),
  asyncHandler(deleteLeadHandler)
);
// KYC verification is restricted to ADMIN/FINANCE — matches the frontend's
// verifyKYC action, which only ever appears in the Finance module UI.
leadsRouter.patch(
  "/:id/kyc",
  requireRole("ADMIN", "FINANCE"),
  validate({ params: leadIdParamSchema }),
  asyncHandler(verifyLeadKycHandler)
);
