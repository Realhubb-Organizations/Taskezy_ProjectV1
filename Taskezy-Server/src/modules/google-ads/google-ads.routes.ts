import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import * as repo from "./google-ads.repository";

export const googleAdsRouter = Router();

googleAdsRouter.use(requireAuth, requireRole("ADMIN"));

// Read-only: unlike Meta, there's no per-account OAuth to trigger from the
// UI — accounts are auto-discovered by the sync job (see
// jobs/googleAdsSpendSync.ts) from the one server-level MCC credential. This
// just surfaces what's been discovered, for a Settings status card.
googleAdsRouter.get(
  "/accounts",
  asyncHandler(async (_req, res) => {
    sendOk(res, await repo.listAccounts());
  })
);
