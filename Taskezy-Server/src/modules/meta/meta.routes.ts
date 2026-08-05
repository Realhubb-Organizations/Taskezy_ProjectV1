import { Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { sendOk } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import {
  exchangeCodeForUserToken,
  fetchLeadData,
  getLongLivedUserToken,
  getManagedPages,
  getOAuthDialogUrl,
  signOAuthState,
  subscribePageToLeadgen,
  verifyOAuthState,
  verifyWebhookSignature
} from "./meta-client";
import { ingestMetaLead } from "./meta.lead-ingest";
import * as repo from "./meta.repository";

export const metaRouter = Router();

// --- Admin-only: connect a Meta Page --------------------------------------

// Returns the dialog URL as JSON (rather than a server-side redirect) because
// this is called via an authenticated fetch() from the SPA — a plain
// top-level browser navigation can't carry the app's Bearer access token.
// The frontend does the actual window.location navigation with the URL below.
metaRouter.get(
  "/connect",
  requireAuth,
  requireRole("ADMIN"),
  (req: Request, res: Response) => {
    sendOk(res, { url: getOAuthDialogUrl(signOAuthState(req.user!.sub)) });
  }
);

// Meta redirects the admin's browser here after they approve — this is a
// top-level navigation, not an XHR, so there's no Authorization header;
// the connecting admin's identity is recovered from the signed `state`.
metaRouter.get(
  "/callback",
  asyncHandler(async (req: Request, res: Response) => {
    const settingsUrl = `${env.FRONTEND_URL}/dashboard/settings`;
    const { code, state, error } = req.query as Record<string, string | undefined>;

    if (error || !code || !state) {
      res.redirect(`${settingsUrl}?meta_error=1`);
      return;
    }
    const adminId = verifyOAuthState(state);
    if (!adminId) {
      res.redirect(`${settingsUrl}?meta_error=invalid_state`);
      return;
    }

    try {
      const shortLivedToken = await exchangeCodeForUserToken(code);
      const { accessToken: longLivedToken } = await getLongLivedUserToken(shortLivedToken);
      const pages = await getManagedPages(longLivedToken);

      if (pages.length === 0) {
        res.redirect(`${settingsUrl}?meta_error=no_pages`);
        return;
      }

      for (const page of pages) {
        await subscribePageToLeadgen(page.id, page.access_token);
        await repo.upsertConnection({
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
          connectedBy: adminId
        });
      }
      res.redirect(`${settingsUrl}?meta_connected=${pages.length}`);
    } catch (err) {
      logger.error({ err }, "Meta OAuth callback failed");
      res.redirect(`${settingsUrl}?meta_error=1`);
    }
  })
);

metaRouter.get("/connections", requireAuth, requireRole("ADMIN"), asyncHandler(async (_req: Request, res: Response) => {
  sendOk(res, await repo.listConnections());
}));

const connectionIdParamSchema = z.object({ id: z.string().uuid() });

metaRouter.delete(
  "/connections/:id",
  requireAuth,
  requireRole("ADMIN"),
  validate({ params: connectionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const ok = await repo.disconnect(req.params.id);
    if (!ok) throw ApiError.notFound("Meta connection not found");
    sendOk(res, { disconnected: true });
  })
);

// --- Public: Meta calls these directly, no user session involved ---------

/** GET verify handshake — Meta calls this once when the webhook subscription is (re)configured in the App Dashboard. */
metaRouter.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === env.META_WEBHOOK_VERIFY_TOKEN && typeof challenge === "string") {
    res.status(200).type("text/plain").send(challenge);
  } else {
    res.sendStatus(403);
  }
});

interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{ field: string; value: { page_id?: string; leadgen_id?: string } }>;
  }>;
}

async function processLeadgenEvent(pageId: string, leadgenId: string): Promise<void> {
  const connection = await repo.getActiveConnectionByPageId(pageId);
  if (!connection) {
    logger.warn({ pageId, leadgenId }, "leadgen webhook for a Page with no active meta_connections row — ignored");
    return;
  }
  const leadData = await fetchLeadData(leadgenId, connection.pageToken);
  await ingestMetaLead(leadData, connection.connectedBy);
}

/** POST delivery — one or more new leads. ACK fast, process after responding so Meta never sees our DB/Graph-API latency. */
metaRouter.post("/webhook", asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["x-hub-signature-256"];
  const rawBody = req.rawBody;
  if (!rawBody || typeof signature !== "string" || !verifyWebhookSignature(rawBody, signature)) {
    res.sendStatus(403);
    return;
  }

  res.sendStatus(200);

  const payload = req.body as MetaWebhookPayload;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const pageId = change.value.page_id ?? entry.id;
      const leadgenId = change.value.leadgen_id;
      if (!pageId || !leadgenId) continue;
      try {
        await processLeadgenEvent(pageId, leadgenId);
      } catch (err) {
        logger.error({ err, pageId, leadgenId }, "Failed to process Meta leadgen webhook event");
      }
    }
  }
}));
