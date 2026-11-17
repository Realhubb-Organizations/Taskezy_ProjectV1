import { logger } from "../utils/logger";
import { getCampaigns, isCampaignActive } from "../modules/meta/meta-client";
import * as metaRepo from "../modules/meta/meta.repository";
import { listLinkedAccounts, listCampaigns } from "../modules/google-ads/google-ads-client";
import * as googleAdsRepo from "../modules/google-ads/google-ads.repository";

/**
 * Light campaign-LIST refresh for Meta and Google Ads: names and status only,
 * no spend or insights. The full spend syncs (metaAdSpendSync.ts,
 * googleAdsSpendSync.ts) only run every 6 hours, so a campaign created in
 * Ads Manager could take up to 6 hours to show up in the property page's
 * campaign picker. Until it's linked there, its leads have no property to
 * route to and land on the fallback admin. This refresh makes a new
 * campaign pickable within 15 minutes, or at once via the picker's
 * Refresh button (refreshCampaignListsNow).
 *
 * Same calls and upserts as the full syncs' first step, so the stored rows
 * are identical. Deliberately does NOT mark Google accounts disconnected
 * (the full sync owns that), so a missed refresh can never wrongly flag an
 * account.
 */
const POLL_INTERVAL_MS = 15 * 60 * 1000;
// Bounds manual Refresh clicks from several admins to one real run a minute.
const MANUAL_COOLDOWN_MS = 60 * 1000;

let running = false;
let lastCompletedAt = 0;
// Last error per platform, so a platform that keeps failing (e.g. bad
// credentials) logs once instead of every 15 minutes.
const lastError: Record<"meta" | "google", string | null> = { meta: null, google: null };

function noteFailure(platform: "meta" | "google", err: unknown, context: Record<string, unknown> = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  if (lastError[platform] === message) return;
  lastError[platform] = message;
  logger.warn({ err, ...context }, `Campaign list refresh: ${platform} failed (logged once until it changes)`);
}

async function refreshMeta(): Promise<number> {
  let synced = 0;
  let failed = false;
  let accounts: Awaited<ReturnType<typeof metaRepo.listActiveAdAccounts>>;
  try {
    accounts = await metaRepo.listActiveAdAccounts();
  } catch (err) {
    noteFailure("meta", err);
    return 0;
  }
  for (const account of accounts) {
    try {
      for (const campaign of await getCampaigns(account.id, account.userToken)) {
        const status = isCampaignActive(campaign) ? "ACTIVE" : "INACTIVE";
        await metaRepo.upsertCampaign({ id: campaign.id, adAccountId: account.id, name: campaign.name, status });
        synced++;
      }
    } catch (err) {
      failed = true;
      noteFailure("meta", err, { adAccountId: account.id });
    }
  }
  if (!failed) lastError.meta = null;
  return synced;
}

async function refreshGoogle(): Promise<number> {
  let synced = 0;
  let failed = false;
  try {
    for (const account of await listLinkedAccounts()) {
      try {
        await googleAdsRepo.upsertAccount({ id: account.id, name: account.name });
        for (const campaign of await listCampaigns(account.id)) {
          const status = campaign.status === "ENABLED" ? "ACTIVE" : "INACTIVE";
          await googleAdsRepo.upsertCampaign({ id: campaign.id, accountId: account.id, name: campaign.name, status });
          synced++;
        }
      } catch (err) {
        failed = true;
        noteFailure("google", err, { accountId: account.id });
      }
    }
  } catch (err) {
    failed = true;
    noteFailure("google", err);
  }
  if (!failed) lastError.google = null;
  return synced;
}

async function runOnce(): Promise<{ meta: number; google: number }> {
  running = true;
  try {
    // Independent platforms: one failing never stops the other.
    const [meta, google] = await Promise.all([refreshMeta(), refreshGoogle()]);
    lastCompletedAt = Date.now();
    return { meta, google };
  } finally {
    running = false;
  }
}

export function startCampaignListSync(): void {
  setInterval(() => {
    if (running) return;
    runOnce().catch(err => logger.error({ err }, "Campaign list refresh cycle failed"));
  }, POLL_INTERVAL_MS).unref();
  logger.info(`Campaign list refresh scheduled (every ${POLL_INTERVAL_MS / 60000} min, Meta + Google, names/status only)`);
}

export type CampaignListRefreshResult =
  | { refreshed: true; meta: number; google: number }
  | { refreshed: false; reason: "in-progress" | "cooldown" };

/** The link picker's Refresh button. Waits for the (light, seconds-long) run so the picker can reload straight after. */
export async function refreshCampaignListsNow(): Promise<CampaignListRefreshResult> {
  if (running) return { refreshed: false, reason: "in-progress" };
  if (Date.now() - lastCompletedAt < MANUAL_COOLDOWN_MS) return { refreshed: false, reason: "cooldown" };
  const counts = await runOnce();
  return { refreshed: true, ...counts };
}
