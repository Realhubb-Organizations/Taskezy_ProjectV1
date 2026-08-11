import { logger } from "../utils/logger";
import { listLinkedAccounts, listCampaigns, getAccountDailyStats } from "../modules/google-ads/google-ads-client";
import * as googleAdsRepo from "../modules/google-ads/google-ads.repository";

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // matches metaAdSpendSync.ts — spend doesn't need per-minute freshness
const LOOKBACK_DAYS = 35; // covers the Reports page's "Last 30 Days" preset with buffer for late-arriving data

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Mirrors metaAdSpendSync.ts, but for Google's Manager (MCC) account model:
 * one credential auto-discovers every linked client account (no per-account
 * OAuth to loop over), and daily stats come back one call per account
 * (covering all its campaigns) rather than one call per campaign.
 */
async function syncOnce(): Promise<void> {
  let accounts;
  try {
    accounts = await listLinkedAccounts();
  } catch (err) {
    logger.error({ err }, "Could not list Google Ads linked accounts — skipping this cycle");
    return;
  }

  if (accounts.length === 0) {
    logger.info("Google Ads spend sync: no linked client accounts found under the MCC — skipping this cycle");
    return;
  }

  await googleAdsRepo.markAllDisconnected();

  const since = isoDateNDaysAgo(LOOKBACK_DAYS);
  const until = isoDateNDaysAgo(0);

  for (const account of accounts) {
    await googleAdsRepo.upsertAccount({ id: account.id, name: account.name });

    let campaigns;
    try {
      campaigns = await listCampaigns(account.id);
    } catch (err) {
      logger.error({ err, accountId: account.id }, "Could not fetch campaigns for Google Ads account — skipping this account this cycle");
      continue;
    }

    const campaignById = new Map(campaigns.map(c => [c.id, c]));
    const propertyByCampaignId = new Map<string, string | null>();

    for (const campaign of campaigns) {
      const status = campaign.status === "ENABLED" ? "ACTIVE" : "INACTIVE";
      const propertyId = await googleAdsRepo.upsertCampaign({ id: campaign.id, accountId: account.id, name: campaign.name, status });
      propertyByCampaignId.set(campaign.id, propertyId);
    }

    try {
      const dailyStats = await getAccountDailyStats(account.id, since, until);
      for (const stat of dailyStats) {
        const campaign = campaignById.get(stat.campaignId);
        if (!campaign) continue; // stats for a campaign outside today's campaign list (e.g. removed) — skip rather than guess a name
        await googleAdsRepo.upsertSpendRecord({
          campaignId: stat.campaignId,
          accountName: campaign.name,
          propertyId: propertyByCampaignId.get(stat.campaignId) ?? null,
          spendDate: stat.date,
          spend: stat.spend,
          leadsGenerated: stat.conversions
        });
      }
    } catch (err) {
      logger.error({ err, accountId: account.id }, "Could not sync daily stats for Google Ads account — skipping, will retry next cycle");
    }
  }

  logger.info({ accounts: accounts.length }, "Google Ads spend sync cycle complete");
}

export function startGoogleAdsSpendSync(): void {
  // Run once shortly after boot (real Google Ads calls, so don't block server startup on it), then on the regular interval.
  setTimeout(() => {
    syncOnce().catch(err => logger.error({ err }, "Initial Google Ads spend sync failed"));
  }, 20_000).unref(); // staggered a few seconds after Meta's own 15s delay, so both don't hit the network in the same instant

  setInterval(() => {
    syncOnce().catch(err => logger.error({ err }, "Google Ads spend sync cycle failed"));
  }, POLL_INTERVAL_MS).unref();

  logger.info(`Google Ads spend sync scheduled (every ${POLL_INTERVAL_MS / 3600000}h, ${LOOKBACK_DAYS}-day lookback)`);
}
