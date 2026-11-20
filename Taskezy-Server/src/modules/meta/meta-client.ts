import crypto from "crypto";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

// Ad-set/ad/creative sync makes one call per ad account, per campaign, and
// per ad every cycle — with enough campaigns/ads that firing them back to
// back blows through Meta's per-ad-account points-based rate limit (error
// code 17, "User request limit reached") well before the loop finishes, so
// only whichever campaigns happen to be iterated first ever get ad-level
// data. A fixed pacing delay between calls plus a backoff-and-retry on code
// 17 keeps every campaign's calls under budget instead of abandoning
// whatever the loop hasn't reached yet for the rest of the cycle.
const CALL_SPACING_MS = 250;
const RATE_LIMIT_BACKOFFS_MS = [10_000, 30_000, 60_000, 120_000];
const RATE_LIMIT_ERROR_CODE = 17;
// Every code Meta uses for "too many calls" (app, user, ad account, insights throttles).
const META_THROTTLE_CODES = [4, 17, 32, 613, 80000, 80004];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** `retryOnRateLimit: false` = optional calls (the lead-loss checks) give up on a rate limit instead of waiting minutes. */
async function graphFetch<T>(path: string, params: Record<string, string>, opts: { retryOnRateLimit?: boolean } = {}): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.toString());
    const body = (await res.json()) as T & { error?: { message: string; type: string; code: number } };
    if (!res.ok || body.error) {
      const isRateLimit = body.error?.code === RATE_LIMIT_ERROR_CODE;
      if (isRateLimit && opts.retryOnRateLimit !== false && attempt < RATE_LIMIT_BACKOFFS_MS.length) {
        const backoffMs = RATE_LIMIT_BACKOFFS_MS[attempt];
        logger.warn({ path, attempt, backoffMs }, "Meta Graph API rate limit hit — backing off and retrying");
        await sleep(backoffMs);
        continue;
      }
      logger.error({ path, metaError: body.error }, "Meta Graph API call failed");
      // `code` lets optional callers tell a rate limit (17, try again later) from a permanent refusal.
      throw Object.assign(new Error(body.error?.message ?? `Meta Graph API call to ${path} failed with status ${res.status}`), { code: body.error?.code });
    }
    await sleep(CALL_SPACING_MS);
    return body;
  }
}

// Safety cap on a list's pages (100-200 items each), so a paging loop can never run forever.
const MAX_LIST_PAGES = 50;

/** Every page of a Graph list — Meta returns at most `limit` items per call plus a cursor for the rest. */
async function graphFetchAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const all: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const body = await graphFetch<{ data?: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(
      path,
      after ? { ...params, after } : params
    );
    all.push(...(body.data ?? []));
    after = body.paging?.next ? body.paging.cursors?.after : undefined;
    if (!after) return all;
  }
  logger.warn({ path, pages: MAX_LIST_PAGES }, "Meta list longer than the page cap — only the first pages were read");
  return all;
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
  // ads_read: campaign/insights spend data (Marketing Reports) — ads_management
  // alone doesn't reliably grant read access to Insights for every ad account type.
  url.searchParams.set("scope", "pages_show_list,pages_manage_metadata,pages_read_engagement,leads_retrieval,ads_management,ads_read,business_management");
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

/**
 * Page tokens minted from a long-lived user token do not expire on their own.
 * Without a limit Meta returns only its default first 25 Pages.
 */
export async function getManagedPages(longLivedUserToken: string, opts: { retryOnRateLimit?: boolean } = {}): Promise<MetaPage[]> {
  const data = await graphFetch<{ data: MetaPage[] }>("/me/accounts", {
    access_token: longLivedUserToken,
    fields: "id,name,access_token",
    limit: "200"
  }, opts);
  return data.data;
}

/** The Facebook person behind a saved login (to tell logins apart and say who manages a Page). */
export async function getMe(longLivedUserToken: string, opts: { retryOnRateLimit?: boolean } = {}): Promise<{ id: string; name: string }> {
  return graphFetch<{ id: string; name: string }>("/me", { access_token: longLivedUserToken, fields: "id,name" }, opts);
}

/** Every Page this login manages (id + name only, up to 200) — for the "Page not connected" check. */
export async function getManagedPageList(longLivedUserToken: string): Promise<{ id: string; name: string }[]> {
  const data = await graphFetch<{ data: { id: string; name: string }[] }>("/me/accounts", {
    access_token: longLivedUserToken,
    fields: "id,name",
    limit: "200"
  }, { retryOnRateLimit: false });
  return data.data ?? [];
}

/** The campaign's objective, e.g. "OUTCOME_LEADS" — so the lead-loss checks skip website/traffic campaigns. */
export async function getCampaignObjective(campaignId: string, longLivedUserToken: string): Promise<string | undefined> {
  const data = await graphFetch<{ objective?: string }>(`/${campaignId}`, {
    access_token: longLivedUserToken,
    fields: "objective"
  }, { retryOnRateLimit: false });
  return data.objective;
}

/**
 * Whether Meta still accepts a saved token. False when e.g. the Page was
 * deleted or unpublished, or the person who connected it lost access. Asks
 * Meta's debug_token with the app's own token, so it works even when the
 * saved token itself no longer does.
 */
export async function isTokenValid(token: string): Promise<boolean> {
  const data = await graphFetch<{ data?: { is_valid?: boolean } }>("/debug_token", {
    input_token: token,
    access_token: `${env.META_APP_ID}|${env.META_APP_SECRET}`
  }, { retryOnRateLimit: false });
  return data.data?.is_valid !== false;
}

/**
 * The Facebook Page(s) a campaign's currently ACTIVE ads run under. Its own
 * call (not part of getAdsForCampaign) so a Meta error here can only skip the
 * lead-loss check, never the Deep Dive ad sync. Asks only for the Page id:
 * creative.actor_id, or the part before "_" in effective_object_story_id
 * ("<pageId>_<postId>").
 */
export async function getCampaignAdPageIds(campaignId: string, longLivedUserToken: string): Promise<string[]> {
  const data = await graphFetch<{ data: { creative?: { actor_id?: string; effective_object_story_id?: string } }[] }>(`/${campaignId}/ads`, {
    access_token: longLivedUserToken,
    fields: "creative{actor_id,effective_object_story_id}",
    effective_status: JSON.stringify(["ACTIVE"]),
    limit: "200"
  }, { retryOnRateLimit: false });
  const ids = (data.data ?? [])
    .map(ad => ad.creative?.actor_id ?? ad.creative?.effective_object_story_id?.split("_")[0])
    .filter((id): id is string => !!id);
  return [...new Set(ids)];
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

export interface MetaAdAccount {
  id: string; // "act_XXXXXXXX"
  name: string;
}

/** The ad accounts this long-lived user token has access to — used to sync real campaign spend. */
export async function getAdAccounts(longLivedUserToken: string, opts: { retryOnRateLimit?: boolean } = {}): Promise<MetaAdAccount[]> {
  const data = await graphFetch<{ data: MetaAdAccount[] }>("/me/adaccounts", {
    access_token: longLivedUserToken,
    fields: "id,name",
    limit: "200"   // Meta's default is only the first 25
  }, opts);
  return data.data;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  /** Total spend over the campaign's whole life; undefined when Meta didn't return it. */
  lifetimeSpend?: number;
}

const CAMPAIGN_FIELDS = "id,name,status,effective_status";

/**
 * Every campaign (any status) under one ad account, every page. Requests both
 * status and effective_status — some ad account/permission combinations leave
 * one or the other unset. With `withLifetimeSpend` (the 6-hourly spend sync
 * only) each campaign's lifetime spend comes in the same call (Meta leaves
 * `insights` out for a campaign that never spent); if Meta refuses that
 * bigger request, the plain list is read and lifetimeSpend stays undefined,
 * so nothing is skipped on a guess.
 */
export async function getCampaigns(adAccountId: string, longLivedUserToken: string, opts: { withLifetimeSpend?: boolean } = {}): Promise<MetaCampaign[]> {
  const plainList = () => graphFetchAll<MetaCampaign>(`/${adAccountId}/campaigns`, { access_token: longLivedUserToken, fields: CAMPAIGN_FIELDS, limit: "200" });
  if (!opts.withLifetimeSpend) return plainList();
  try {
    // 100 per page: the spend figure makes each page heavier for Meta.
    const rows = await graphFetchAll<MetaCampaign & { insights?: { data?: { spend?: string }[] } }>(`/${adAccountId}/campaigns`, {
      access_token: longLivedUserToken,
      fields: `${CAMPAIGN_FIELDS},insights.date_preset(maximum){spend}`,
      limit: "100"
    });
    return rows.map(({ insights, ...campaign }) => {
      const spend = Number(insights?.data?.[0]?.spend ?? 0);
      return { ...campaign, lifetimeSpend: Number.isFinite(spend) ? spend : undefined };
    });
  } catch (err) {
    // Meta busy (any of its rate-limit codes): don't hit the throttled account
    // again straight away — this account waits for the next cycle, as before.
    if (META_THROTTLE_CODES.includes((err as { code?: number }).code ?? 0)) throw err;
    logger.warn({ err, adAccountId }, "Meta refused the campaign list with lifetime spend — reading the plain list");
    return plainList();
  }
}

/** True if either status field Meta returned says this campaign is actually running — effective_status can be missing/stale depending on the permission level the token was granted. */
export function isCampaignActive(campaign: MetaCampaign): boolean {
  return campaign.effective_status?.toUpperCase() === "ACTIVE" || campaign.status?.toUpperCase() === "ACTIVE";
}

export interface MetaDailyInsight {
  date_start: string; // YYYY-MM-DD
  spend?: string;
  actions?: { action_type: string; value: string }[];
  // Campaign-level calls only (see getCampaignDailyInsights).
  impressions?: string;
  clicks?: string;
}

/** Daily spend + lead counts for one campaign over the given date range — one call, not one per day (time_increment=1 returns each day as its own row). */
export async function getCampaignDailyInsights(campaignId: string, longLivedUserToken: string, since: string, until: string): Promise<MetaDailyInsight[]> {
  const data = await graphFetch<{ data: MetaDailyInsight[] }>(`/${campaignId}/insights`, {
    access_token: longLivedUserToken,
    // impressions/clicks feed the Campaigns page's Impressions, Clicks and CTR.
    fields: "spend,actions,date_start,impressions,clicks",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1"
  });
  return data.data ?? [];
}

/**
 * The day's lead count. Meta reports the SAME leads under several action
 * types at once ("lead", "onsite_conversion.lead_grouped", "leadgen_grouped"…),
 * so they must never be added together (that counted every lead ~5 times).
 * Uses Meta's own total "lead"; without it, the biggest lead-type value.
 */
export function extractLeadCount(insight: MetaDailyInsight): number {
  const leadActions = (insight.actions ?? []).filter(a => a.action_type.toLowerCase().includes("lead"));
  const total = leadActions.find(a => a.action_type === "lead");
  if (total) return Number(total.value) || 0;
  return leadActions.reduce((max, a) => Math.max(max, Number(a.value) || 0), 0);
}

export interface MetaAdSet {
  id: string;
  name: string;
  status?: string;
}

/** Every ad set under one campaign — real names, for Campaign Deep Dive's Ad Set Name column. */
export async function getAdSetsForCampaign(campaignId: string, longLivedUserToken: string): Promise<MetaAdSet[]> {
  return graphFetchAll<MetaAdSet>(`/${campaignId}/adsets`, {
    access_token: longLivedUserToken,
    fields: "id,name,status",
    limit: "200"
  });
}

export interface MetaAdCreative {
  id: string;
  name?: string;
}

export interface MetaAd {
  id: string;
  name: string;
  adset_id: string;
  status?: string;
  creative?: MetaAdCreative;
}

/** Every ad under one campaign, each with its own creative — real names for Campaign Deep Dive's Ad creative Name column, and the adset_id linking each ad back to its real ad set. */
export async function getAdsForCampaign(campaignId: string, longLivedUserToken: string): Promise<MetaAd[]> {
  return graphFetchAll<MetaAd>(`/${campaignId}/ads`, {
    access_token: longLivedUserToken,
    fields: "id,name,adset_id,status,creative{id,name}",
    limit: "200"
  });
}

/**
 * Daily spend + lead counts for one individual ad — same shape/semantics as
 * getCampaignDailyInsights, just one level finer, for a real per-ad-set/
 * ad-creative CPL breakdown instead of just the campaign's own totals.
 *
 * This is the highest-volume call in the whole sync (one per ad, and an ad
 * account can easily have dozens-to-hundreds of ads) — it used to bypass
 * graphFetch with its own bare fetch(), with no pacing between calls and no
 * retry on a rate-limit hit, which is what let a long run of these blow
 * through Meta's per-ad-account points budget well before every ad got its
 * turn. Routing it through the same shared graphFetch as every other call
 * here gives it the same 250ms pacing + exponential backoff-and-retry for free.
 */
export async function getAdDailyInsights(adId: string, longLivedUserToken: string, since: string, until: string): Promise<MetaDailyInsight[]> {
  const data = await graphFetch<{ data: MetaDailyInsight[] }>(`/${adId}/insights`, {
    access_token: longLivedUserToken,
    fields: "spend,actions,date_start",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1"
  });
  return data.data ?? [];
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
