import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { pool } from "../../db/pool";
import { getTenantSettings } from "./tenant-settings.repository";

export const tenantSettingsRouter = Router();

tenantSettingsRouter.use(requireAuth);

// Read access is open to any authenticated user — the HRMS punch-in flow
// needs the geofence values and the Finance invoice form needs the GST
// rate/due-days default regardless of role; only writing is ADMIN-gated below.
tenantSettingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    sendOk(res, await getTenantSettings());
  })
);

const updateSchema = z.object({
  officeLat: z.number().min(-90).max(90).optional(),
  officeLng: z.number().min(-180).max(180).optional(),
  geofenceRadiusMeters: z.number().int().positive().optional(),
  halfDayThresholdHours: z.number().positive().max(24).optional(),
  gstRate: z.number().min(0).max(100).optional(),
  invoiceDueDays: z.number().int().positive().optional()
});

// Admin-only — these drive real business rules (geofence enforcement,
// half/full-day classification, GST calculation, invoice due dates), not
// cosmetic display settings.
tenantSettingsRouter.patch(
  "/",
  requireRole("ADMIN"),
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const fields: Record<string, unknown> = {
      office_lat: req.body.officeLat,
      office_lng: req.body.officeLng,
      geofence_radius_meters: req.body.geofenceRadiusMeters,
      half_day_threshold_hours: req.body.halfDayThresholdHours,
      gst_rate: req.body.gstRate,
      invoice_due_days: req.body.invoiceDueDays
    };
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length > 0) {
      const setClause = entries.map(([col], i) => `${col} = $${i + 1}`).join(", ");
      const values = entries.map(([, v]) => v);
      await pool.query(`UPDATE tenant_settings SET ${setClause} WHERE id = true`, values);
    }
    sendOk(res, await getTenantSettings());
  })
);
