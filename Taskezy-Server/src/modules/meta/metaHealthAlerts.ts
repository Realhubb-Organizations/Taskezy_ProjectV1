import { query } from "../../db/pool";
import { logger } from "../../utils/logger";
import { BUSINESS_TIMEZONE, businessDateOffset } from "../../utils/businessDate";
import { listActiveAdminIds } from "../users/users.repository";
import { createNotification } from "../notifications/notifications.service";
import { getManagedPageList, getCampaignAdPageIds, getCampaignObjective, isTokenValid } from "./meta-client";
import { listPageConnectionStates, getActiveConnectionByPageId } from "./meta.repository";

/**
 * Alerts admins (Reminder Alerts) when Meta leads can't reach Taskezy, so a
 * gap like UrbanRise (Meta 12 leads, Taskezy 0) is noticed within a day
 * instead of months later. Runs at most once per business day, after the Meta
 * sync has finished and refreshed the Campaigns page (jobs/metaAdSpendSync.ts).
 * Its Meta calls never wait on a rate limit: a rate-limited check stops and the
 * day isn't marked done, so the next cycle runs it again. Every step is
 * isolated; nothing here can throw.
 *
 *  1. A Facebook Page the connected login manages isn't connected (weekly
 *     reminder; Pages someone disconnected on purpose are left alone).
 *  2. An active lead campaign runs active ads on a Page that isn't
 *     connected, so its leads are being lost right now.
 *  3. Last 7 days: Meta reports 5+ leads for a lead campaign but Taskezy
 *     received less than half of them, whatever the cause.
 *  4. A connected Page whose saved connection Meta no longer accepts, so its
 *     leads are silently lost (weekly reminder).
 *
 * "Lead campaign" = objective OUTCOME_LEADS / LEAD_GENERATION, so website or
 * traffic campaigns (whose pixel "leads" Meta also counts) never alert.
 */

const INTEGRATIONS_LINK = "/dashboard/settings/integrations";
const WINDOW_DAYS = 7;
const MISSING_LEADS_MIN_META = 5;      // too few to judge below this
const MISSING_LEADS_MAX_SHARE = 0.5;   // alert when Taskezy has less than half of Meta's leads
const UNCONNECTED_PAGE_REMIND_DAYS = 7;
const LEAD_OBJECTIVES = new Set(["OUTCOME_LEADS", "LEAD_GENERATION"]);

type Account = { id: string; userToken: string };

let lastRunDay: string | null = null;
// When each unconnected Page was last reminded about. Kept here, not read back
// from notifications, because read notifications are deleted after 48h.
// ponytail: in-memory, so a server restart allows one extra reminder; move to a
// table if that ever matters.
const pageLastReminded = new Map<string, string>();
// Same, for connected Pages whose saved connection stopped working.
const deadPageLastReminded = new Map<string, string>();
// A campaign's objective never changes, so Meta is asked once per campaign.
const objectiveByCampaign = new Map<string, string>();

// 17 = per-user limit; 4 / 32 / 613 = app, Page and call-rate limits (debug_token runs on the app's own token).
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const isRateLimit = (err: unknown) => RATE_LIMIT_CODES.has((err as { code?: number })?.code ?? 0);

export async function runDailyMetaHealthChecks(accounts: Account[]): Promise<void> {
  const today = businessDateOffset(0);
  if (lastRunDay === today) return;

  let states: Map<string, "ACTIVE" | "DISCONNECTED">;
  try {
    states = await listPageConnectionStates();
  } catch (err) {
    logger.warn({ err }, "Could not read connected Pages — skipping the Meta lead-loss checks this cycle");
    return; // retried next cycle
  }
  const connected = new Set([...states].filter(([, s]) => s === "ACTIVE").map(([id]) => id));
  const disconnected = new Set([...states].filter(([, s]) => s !== "ACTIVE").map(([id]) => id));
  const tokenByAccount = new Map(accounts.map(a => [a.id, a.userToken]));

  let pagesListed = true;
  const pageNames = new Map<string, string>();
  for (const token of new Set(accounts.map(a => a.userToken))) {
    try {
      for (const page of await getManagedPageList(token)) pageNames.set(page.id, page.name);
    } catch (err) {
      // Rate limit: try the whole day again next cycle. Anything else (e.g. an
      // expired login) won't fix itself by retrying, so just skip that login.
      if (isRateLimit(err)) pagesListed = false;
      logger.warn({ err }, "Could not list Facebook Pages for the unconnected-Page check");
    }
  }

  await alertUnconnectedPages([...pageNames].map(([id, name]) => ({ id, name })), connected, disconnected);
  const deadChecked = await alertDeadPageConnections(connected);
  const campaignsChecked = await alertLeadCampaignsOnUnconnectedPages(tokenByAccount, connected, pageNames);
  const missingChecked = await alertMissingMetaLeads(tokenByAccount);
  // Only a complete run counts for the day; otherwise the next cycle tries again.
  if (pagesListed && deadChecked && campaignsChecked && missingChecked) lastRunDay = today;
}

/** Sends to every active admin unless an alert with this title went out within `withinDays` business days. */
async function notifyAdmins(title: string, message: string, link: string, withinDays = 1): Promise<void> {
  // ponytail: two overlapping runs could both pass this check; the sync never overlaps (isSyncing guard).
  const { rows } = await query<{ n: string }>(
    `SELECT count(*) AS n FROM notifications
     WHERE category = 'REMINDER' AND title = $1
       AND created_at >= (((now() AT TIME ZONE $2)::date - ($3::int - 1))::timestamp AT TIME ZONE $2)`,
    [title, BUSINESS_TIMEZONE, withinDays]
  );
  if (Number(rows[0]?.n ?? 0) > 0) return;
  for (const adminId of await listActiveAdminIds()) {
    try {
      await createNotification({ system: "CRM", category: "REMINDER", title, message, recipientUserId: adminId, link });
    } catch (err) {
      logger.error({ err, adminId, title }, "Could not send a Meta lead-loss alert to an admin");
    }
  }
}

/**
 * Whether a campaign is a lead campaign: true / false, or null when Meta
 * couldn't say right now (the caller skips the alert and retries next cycle).
 * No login for the campaign's ad account at all counts as yes, so a real loss
 * isn't hidden: better one extra alert than a missed one.
 */
async function isLeadCampaign(campaignId: string, token: string | undefined): Promise<boolean | null> {
  const cached = objectiveByCampaign.get(campaignId);
  if (cached !== undefined) return cached === "" || LEAD_OBJECTIVES.has(cached);
  if (!token) return true;
  try {
    const objective = (await getCampaignObjective(campaignId, token)) ?? "";
    objectiveByCampaign.set(campaignId, objective);
    return objective === "" || LEAD_OBJECTIVES.has(objective);
  } catch (err) {
    logger.warn({ err, campaignId }, "Could not read this campaign's objective; will check it next cycle");
    return null;
  }
}

/** 1. Pages the connected login manages but Taskezy doesn't. Skips Pages someone disconnected on purpose. */
export async function alertUnconnectedPages(
  pages: { id: string; name: string }[], connected: Set<string>, disconnected: Set<string> = new Set()
): Promise<void> {
  const remindedSince = businessDateOffset(-(UNCONNECTED_PAGE_REMIND_DAYS - 1));
  for (const page of pages) {
    if (connected.has(page.id) || disconnected.has(page.id)) continue;
    const last = pageLastReminded.get(page.id);
    if (last && last >= remindedSince) continue;
    try {
      await notifyAdmins(
        `Facebook Page not connected: ${page.name}`,
        `Leads from the Facebook Page "${page.name}" don't reach Taskezy because it isn't connected. ` +
        `If this Page runs lead ads, go to Settings → Integrations → Meta, reconnect and tick it.`,
        INTEGRATIONS_LINK,
        UNCONNECTED_PAGE_REMIND_DAYS
      );
      pageLastReminded.set(page.id, businessDateOffset(0));
    } catch (err) {
      logger.error({ err, pageId: page.id }, "Unconnected Page alert failed");
    }
  }
}

/**
 * 4. Connected Pages whose saved connection Meta no longer accepts (the Page
 * was deleted or unpublished, or the person who connected it lost access).
 * Taskezy still shows them as connected, but every lead from them fails to
 * load. Returns false on a rate limit so the next cycle finishes the check.
 */
export async function alertDeadPageConnections(pageIds: Iterable<string>): Promise<boolean> {
  const remindedSince = businessDateOffset(-(UNCONNECTED_PAGE_REMIND_DAYS - 1));
  for (const pageId of pageIds) {
    const last = deadPageLastReminded.get(pageId);
    if (last && last >= remindedSince) continue;
    try {
      const conn = await getActiveConnectionByPageId(pageId);
      if (!conn || (await isTokenValid(conn.pageToken))) continue;
      const name = conn.pageName.trim();
      await notifyAdmins(
        `Facebook Page connection stopped working: ${name}`,
        `Taskezy can't read leads from the Facebook Page "${name}" any more: Meta no longer accepts its saved connection ` +
        `(the Page may have been deleted or unpublished, or the person who connected it lost access). Any leads from it are lost. ` +
        `Go to Settings → Integrations → Meta and reconnect with a Facebook account that manages this Page, or disconnect it if it's no longer used.`,
        INTEGRATIONS_LINK,
        UNCONNECTED_PAGE_REMIND_DAYS
      );
      deadPageLastReminded.set(pageId, businessDateOffset(0));
    } catch (err) {
      if (isRateLimit(err)) {
        logger.warn({ err, pageId }, "Meta rate limit in the Page connection check; finishing next cycle");
        return false;
      }
      logger.warn({ err, pageId }, "Could not check this Page's connection; skipping it this cycle");
    }
  }
  return true;
}

/**
 * 2. Active campaigns that produced Meta leads in the last 7 days, whose ACTIVE
 * ads run on an unconnected Page. Returns false if Meta failed partway (e.g. a
 * rate limit), so the day isn't marked done and the next cycle finishes it.
 */
async function alertLeadCampaignsOnUnconnectedPages(
  tokenByAccount: Map<string, string>, connected: Set<string>, pageNames: Map<string, string>
): Promise<boolean> {
  let campaigns: { id: string; name: string; ad_account_id: string }[];
  try {
    ({ rows: campaigns } = await query<{ id: string; name: string; ad_account_id: string }>(
      `SELECT mc.id, mc.name, mc.ad_account_id FROM meta_campaigns mc
       WHERE mc.status = 'ACTIVE' AND EXISTS (
         SELECT 1 FROM ad_spend_records a
         WHERE a.meta_campaign_id = mc.id AND a.lead_count_fixed AND a.leads_generated > 0
           AND a.spend_date >= (now() AT TIME ZONE $1)::date - ($2::int - 1))
       ORDER BY mc.name`,
      [BUSINESS_TIMEZONE, WINDOW_DAYS]
    ));
  } catch (err) {
    logger.error({ err }, "Could not list lead campaigns for the unconnected-Page check");
    return false;
  }
  let complete = true;
  for (const c of campaigns) {
    const token = tokenByAccount.get(c.ad_account_id);
    if (!token) continue;
    let pageIds: string[];
    try {
      pageIds = await getCampaignAdPageIds(c.id, token);
    } catch (err) {
      // Rate limit: stop now, the next cycle finishes. Any other refusal is
      // about this one campaign: skip it so the rest still get checked.
      if (isRateLimit(err)) {
        logger.warn({ err, campaignId: c.id }, "Meta rate limit in the unconnected-Page check; finishing next cycle");
        return false;
      }
      logger.warn({ err, campaignId: c.id }, "Could not check which Page this campaign's ads use; skipping this campaign");
      continue;
    }
    const missing = pageIds.filter(id => !connected.has(id));
    if (missing.length === 0) continue;
    const lead = await isLeadCampaign(c.id, token);
    if (lead === null) { complete = false; continue; }
    if (!lead) continue;
    try {
      const pages = missing.map(id => `"${pageNames.get(id) ?? `Page ID ${id}`}"`).join(", ");
      await notifyAdmins(
        `Campaign on an unconnected Page: ${c.name}`,
        `The campaign "${c.name}" runs ads on ${pages}, which ${missing.length === 1 ? "isn't" : "aren't"} connected to Taskezy, ` +
        `so its leads are being lost. Go to Settings → Integrations → Meta, reconnect and tick ${missing.length === 1 ? "that Page" : "those Pages"}.`,
        INTEGRATIONS_LINK
      );
    } catch (err) {
      logger.error({ err, campaignId: c.id }, "Campaign-on-unconnected-Page alert failed");
    }
  }
  return complete;
}

/**
 * 3. Meta's lead count (corrected rows only, migration 056) vs leads Taskezy
 * received, per Meta campaign over the last 7 days. A lead counts for the
 * campaign by its Meta ad id, or by name as a fallback, so a campaign renamed
 * in Meta isn't mistaken for one losing leads. Small gaps are normal (repeat
 * enquiries become Revived Leads, days split differently), hence 5+ leads and
 * under half.
 */
export async function alertMissingMetaLeads(tokenByAccount: Map<string, string> = new Map()): Promise<boolean> {
  let rows: { cid: string; campaign: string; ad_account_id: string | null; meta_leads: number; taskezy_leads: number }[];
  try {
    ({ rows } = await query<{ cid: string; campaign: string; ad_account_id: string | null; meta_leads: number; taskezy_leads: number }>(
      `WITH bounds AS (
         SELECT (now() AT TIME ZONE $1)::date - ($2::int - 1) AS since_day
       ),
       meta AS (
         SELECT a.meta_campaign_id AS cid, max(a.account_name) AS campaign, sum(a.leads_generated)::int AS meta_leads
         FROM ad_spend_records a, bounds b
         WHERE a.platform = 'META' AND a.lead_count_fixed AND a.meta_campaign_id IS NOT NULL AND a.spend_date >= b.since_day
         GROUP BY a.meta_campaign_id
         HAVING sum(a.leads_generated) >= $3
       ),
       recent AS (
         SELECT l.meta_ad_id, lower(COALESCE(l.campaign, l.source)) AS cname
         FROM leads l, bounds b
         WHERE l.created_at >= (b.since_day::timestamp AT TIME ZONE $1)
       )
       SELECT m.cid, m.campaign, mc.ad_account_id, m.meta_leads,
              (SELECT count(*)::int FROM recent r
               WHERE r.meta_ad_id IN (SELECT id FROM meta_ads WHERE campaign_id = m.cid)
                  OR r.cname = lower(m.campaign)) AS taskezy_leads
       FROM meta m
       LEFT JOIN meta_campaigns mc ON mc.id = m.cid`,
      [BUSINESS_TIMEZONE, WINDOW_DAYS, MISSING_LEADS_MIN_META]
    ));
  } catch (err) {
    logger.error({ err }, "Missing Meta leads check failed");
    return false;
  }
  let complete = true;
  for (const r of rows) {
    if (r.taskezy_leads >= r.meta_leads * MISSING_LEADS_MAX_SHARE) continue;
    try {
      const lead = await isLeadCampaign(r.cid, r.ad_account_id ? tokenByAccount.get(r.ad_account_id) : undefined);
      if (lead === null) { complete = false; continue; }
      if (!lead) continue;
      await notifyAdmins(
        `Meta leads missing: ${r.campaign}`,
        `Last ${WINDOW_DAYS} days: Meta reports ${r.meta_leads} leads for "${r.campaign}", but Taskezy received ${r.taskezy_leads}. ` +
        `Check that the campaign's Facebook Page is connected in Settings → Integrations → Meta.`,
        "/dashboard/crm/campaigns"
      );
    } catch (err) {
      logger.error({ err, campaign: r.campaign }, "Missing Meta leads alert failed");
    }
  }
  return complete;
}
