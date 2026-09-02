import crypto from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { logger } from "../../utils/logger";
import { ingestSheetLead, SheetLeadRow } from "./sheet-import.lead-ingest";

export const sheetImportRouter = Router();

const sheetLeadSchema = z.object({
  leadKey: z.string().min(1),
  timestamp: z.coerce.string().optional().nullable(),
  name: z.string().min(1),
  email: z.string().optional().nullable(),
  phone: z.coerce.string().min(1),
  status: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  formSource: z.string().optional().nullable(),
  campaign: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  medium: z.string().optional().nullable(),
  keyword: z.string().optional().nullable(),
  gclid: z.string().optional().nullable(),
  landingPage: z.string().optional().nullable(),
  browser: z.string().optional().nullable(),
  sourceSheet: z.string().optional().nullable()
});

// --- Public: the Google Apps Script sync calls this directly with a static
// API key, no user session involved — same "public, external caller" shape
// as the Meta webhook (see modules/meta/meta.routes.ts), just key-based
// instead of signature-based since there's no per-request HMAC from Apps
// Script the way Meta signs its webhook deliveries.
function requireSheetImportKey(req: Request, res: Response, next: NextFunction): void {
  const provided = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${env.SHEET_IMPORT_API_KEY}`);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    res.sendStatus(401);
    return;
  }
  next();
}

sheetImportRouter.post(
  "/",
  requireSheetImportKey,
  validate({ body: sheetLeadSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const row = req.body as SheetLeadRow;
    const result = await ingestSheetLead(row);

    if (result.outcome === "skipped") {
      // Deliberately NOT a 200 — the Apps Script only marks a row "synced"
      // (stops retrying it) on a 200. A skip is often transient (e.g. no
      // active admin yet), so it should keep being retried on every sync
      // rather than being marked done and forgotten. A row that's
      // permanently unfixable (e.g. dummy test data with an invalid phone)
      // just retries harmlessly forever — a few extra bytes per sync cycle.
      logger.warn({ leadKey: row.leadKey, reason: result.reason }, "Sheet lead skipped");
      sendOk(res, { imported: false, outcome: result.outcome, reason: result.reason }, 422);
      return;
    }
    sendOk(res, { imported: result.outcome === "created", outcome: result.outcome });
  })
);
