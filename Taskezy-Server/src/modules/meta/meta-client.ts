import crypto from "crypto";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

async function graphFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const res = await fetch(url.toString());
  const body = (await res.json()) as T & { error?: { message: string; type: string; code: number } };
  if (!res.ok || body.error) {
    logger.error({ path, metaError: body.error }, "Meta Graph API call failed");
    throw new Error(body.error?.message ?? `Meta Graph API call to ${path} failed with status ${res.status}`);
  }
  return body;
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Signs { adminId, ts } into the OAuth `state` param itself — stateless CSRF
 * binding (no server-side session needed) since Meta's callback redirect is
 * a plain browser navigation with no Authorization header to identify the
 * connecting admin from.
 */
export function signOAuthState(adminId: string): string {
  const payload = Buffer.from(JSON.stringify({ adminId, ts: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** Returns the admin ID that initiated /connect if `state` is untampered and not stale, else undefined. */
export function verifyOAuthState(state: string): string | undefined {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return undefined;
  const expected = crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update(payload).digest("base64url");
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signature);
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) return undefined;
  try {
    const { adminId, ts } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { adminId: string; ts: number };
    if (Date.now() - ts > STATE_MAX_AGE_MS) return undefined;
    return adminId;
  } catch {
    return undefined;
  }
}

export function getOAuthDialogUrl(state: string): string {
  const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("redirect_uri", env.META_OAUTH_REDIRECT_URI);
  url.searchParams.set("state", state);
  // pages_show_list + pages_manage_metadata: enumerate/subscribe Pages.
  // leads_retrieval: read submitted lead field data. All three need Meta App Review before going live.
  url.searchParams.set("scope", "pages_show_list,pages_manage_metadata,pages_read_engagement,leads_retrieval,ads_management,business_management");
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeCodeForUserToken(code: string): Promise<string> {
  const data = await graphFetch<{ access_token: string }>("/oauth/access_token", {
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: env.META_OAUTH_REDIRECT_URI,
    code
  });
  return data.access_token;
}

/** Short-lived (~2hr) user token -> long-lived (~60 day) user token. */
export async function getLongLivedUserToken(shortLivedToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const data = await graphFetch<{ access_token: string; expires_in: number }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    fb_exchange_token: shortLivedToken
  });
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
}

/** Page tokens minted from a long-lived user token do not expire on their own. */
export async function getManagedPages(longLivedUserToken: string): Promise<MetaPage[]> {
  const data = await graphFetch<{ data: MetaPage[] }>("/me/accounts", {
    access_token: longLivedUserToken,
    fields: "id,name,access_token"
  });
  return data.data;
}

/** Subscribes this Page to receive `leadgen` webhook events for our app. */
export async function subscribePageToLeadgen(pageId: string, pageAccessToken: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/${pageId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "leadgen");
  url.searchParams.set("access_token", pageAccessToken);
  const res = await fetch(url.toString(), { method: "POST" });
  const body = (await res.json()) as { success?: boolean; error?: { message: string } };
  if (!res.ok || body.error || !body.success) {
    logger.error({ pageId, metaError: body.error }, "Failed to subscribe Page to leadgen webhook");
    throw new Error(body.error?.message ?? `Failed to subscribe Page ${pageId} to the leadgen webhook`);
  }
}

export interface MetaLeadFieldDatum {
  name: string;
  values: string[];
}

export interface MetaLeadData {
  id: string;
  created_time: string;
  field_data: MetaLeadFieldDatum[];
  ad_id?: string;
  form_id?: string;
  campaign_name?: string;
}

/** Pulls the actual submitted answers for one leadgen event — the webhook payload itself only carries the leadgen_id. */
export async function fetchLeadData(leadgenId: string, pageAccessToken: string): Promise<MetaLeadData> {
  return graphFetch<MetaLeadData>(`/${leadgenId}`, {
    access_token: pageAccessToken,
    fields: "id,created_time,field_data,ad_id,form_id,campaign_name"
  });
}

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body
 * using our App Secret — the only proof a webhook POST actually came from
 * Meta and not a spoofed request hitting our public endpoint.
 */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
