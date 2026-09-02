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
  fixSheetLeadTimestampsHandler,
  getLeadHandler,
  listLeadsHandler,
  reassignLeadHandler,
  reassignUnassignedSheetLeadsHandler,
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
// Maintenance action for the Google Ads sheet import (see modules/sheet-import):
// re-checks every sheet-imported lead that fell back to an admin because its
// property didn't match/had no team configured yet, and moves it to a real
// agent now that that's been fixed. Safe to call more than once — a lead
// that still doesn't resolve to a real agent is left untouched.
leadsRouter.post(
  "/reassign-sheet-fallback",
  requireRole("ADMIN"),
  asyncHandler(reassignUnassignedSheetLeadsHandler)
);
// Maintenance action for the Google Ads sheet import: created_at used to
// default to whenever the sync ran rather than the sheet's own Timestamp —
// this backfills the real date onto every lead imported before that was
// fixed, recovered from each lead's own import log entry. Safe to re-run —
// a lead whose created_at is already correct is left untouched.
leadsRouter.post(
  "/fix-sheet-lead-timestamps",
  requireRole("ADMIN"),
  asyncHandler(fixSheetLeadTimestampsHandler)
);
// KYC verification is restricted to ADMIN/FINANCE — matches the frontend's
// verifyKYC action, which only ever appears in the Finance module UI.
leadsRouter.patch(
  "/:id/kyc",
  requireRole("ADMIN", "FINANCE"),
  validate({ params: leadIdParamSchema }),
  asyncHandler(verifyLeadKycHandler)
);
