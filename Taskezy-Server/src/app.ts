import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRateLimiter } from "./middleware/rateLimiter";
import { logger } from "./utils/logger";
import { ApiError } from "./utils/ApiError";
import { authRouter } from "./modules/auth/auth.routes";
import { leadsRouter } from "./modules/leads/leads.routes";
import { usersRouter } from "./modules/users/users.routes";
import { healthRouter } from "./modules/health/health.routes";
import { propertiesRouter } from "./modules/properties/properties.routes";
import { resaleUnitsRouter } from "./modules/resale-units/resale-units.routes";
import { followupsRouter } from "./modules/followups/followups.routes";
import { attendanceRouter } from "./modules/attendance/attendance.routes";
import { timesheetsRouter } from "./modules/timesheets/timesheets.routes";
import { reimbursementsRouter } from "./modules/reimbursements/reimbursements.routes";
import { invoicesRouter } from "./modules/invoices/invoices.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { calendarEventsRouter } from "./modules/calendar-events/calendar-events.routes";
import { adSpendRouter } from "./modules/ad-spend/ad-spend.routes";
import { metaRouter } from "./modules/meta/meta.routes";
import { googleAdsRouter } from "./modules/google-ads/google-ads.routes";
import { tenantSettingsRouter } from "./modules/tenant-settings/tenant-settings.routes";
import { sheetImportRouter } from "./modules/sheet-import/sheet-import.routes";

export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy / load balancer (nginx, Render, Railway, etc.) so
  // req.ip and req.secure reflect the real client, not the proxy hop.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (server-to-server, curl, health checks) — allow.
        if (!origin || env.corsAllowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new ApiError(403, "Origin not allowed", "CORS_FORBIDDEN"));
        }
      },
      credentials: true // required for the httpOnly refresh-token cookie
    })
  );
  app.use(compression());
  app.use(
    express.json({
      limit: "1mb", // bounded body size — cheap DoS mitigation
      // Meta's X-Hub-Signature-256 webhook signature is computed over the exact
      // bytes they sent — stash them here since req.body below is parsed/re-orderable.
      verify: (req, _res, buf) => {
        (req as Express.Request & { rawBody?: Buffer }).rawBody = buf;
      }
    })
  );
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));

  app.use("/api", apiRateLimiter);

  app.use("/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/leads", leadsRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/properties", propertiesRouter);
  app.use("/api/v1/resale-units", resaleUnitsRouter);
  app.use("/api/v1/followups", followupsRouter);
  app.use("/api/v1/attendance", attendanceRouter);
  app.use("/api/v1/timesheets", timesheetsRouter);
  app.use("/api/v1/reimbursements", reimbursementsRouter);
  app.use("/api/v1/invoices", invoicesRouter);
  app.use("/api/v1/notifications", notificationsRouter);
  app.use("/api/v1/calendar-events", calendarEventsRouter);
  app.use("/api/v1/ad-spend", adSpendRouter);
  app.use("/api/v1/meta", metaRouter);
  app.use("/api/v1/google-ads", googleAdsRouter);
  app.use("/api/v1/tenant-settings", tenantSettingsRouter);
  // Public: the Google Ads lead-form sheet's Apps Script calls this directly
  // with a static API key (see sheet-import.routes.ts) — deliberately its own
  // top-level mount, not nested under /api/v1/leads, so it never runs through
  // that router's blanket requireAuth (leads.routes.ts:26).
  app.use("/api/v1/integrations/sheet-leads", sheetImportRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
