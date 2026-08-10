import { logger } from "../utils/logger";
import { getCampaignDailyInsights, getCampaigns, extractLeadCount } from "../modules/meta/meta-client";
import * as metaRepo from "../modules/meta/meta.repository";

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // spend doesn't need per-minute freshness like leads
const LOOKBACK_DAYS = 35; // covers the Reports page's "Last 30 Days" preset with buffer for late-arriving data

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Pulls real spend + platform-reported lead counts from Meta's Insights API
 * for every campaign under every connected ad account, and upserts them into
 * ad_spend_records — the same table Marketing Reports has always read from,
 * previously only ever populated by manual/seed data (i.e. always empty in
 * production). One insights call per campaign (time_increment=1 returns the
 * whole window's daily rows in one response), not one call per day.
 */
async function syncOnce(): Promise<void> {
  const adAccounts = await metaRepo.listActiveAdAccounts();
  if (adAccounts.length === 0) return;

  const since = isoDateNDaysAgo(LOOKBACK_DAYS);
  const until = isoDateNDaysAgo(0);

  for (const account of adAccounts) {
    let campaigns;
    try {
      campaigns = await getCampaigns(account.id, account.userToken);
    } catch (err) {
      logger.error({ err, adAccountId: account.id }, "Could not fetch campaigns for ad account — skipping this account this cycle");
      continue;
    }

    for (const campaign of campaigns) {
      const status = campaign.effective_status === "ACTIVE" ? "ACTIVE" : "INACTIVE";
      try {
        const propertyId = await metaRepo.upsertCampaign({ id: campaign.id, adAccountId: account.id, name: campaign.name, status });

        const dailyInsights = await getCampaignDailyInsights(campaign.id, account.userToken, since, until);
        for (const day of dailyInsights) {
          await metaRepo.upsertSpendRecord({
            campaignId: campaign.id,
            accountName: campaign.name,
            propertyId,
            spendDate: day.date_start,
            spend: Number(day.spend) || 0,
            leadsGenerated: extractLeadCount(day)
          });
        }
      } catch (err) {
        logger.error({ err, campaignId: campaign.id }, "Could not sync insights for campaign — skipping, will retry next cycle");
      }
    }
  }

  logger.info({ adAccounts: adAccounts.length }, "Meta ad spend sync cycle complete");
}

export function startMetaAdSpendSync(): void {
  // Run once shortly after boot (real Meta calls, so don't block server startup on it), then on the regular interval.
  setTimeout(() => {
    syncOnce().catch(err => logger.error({ err }, "Initial Meta ad spend sync failed"));
  }, 15_000).unref();

  setInterval(() => {
    syncOnce().catch(err => logger.error({ err }, "Meta ad spend sync cycle failed"));
  }, POLL_INTERVAL_MS).unref();

  logger.info(`Meta ad spend sync scheduled (every ${POLL_INTERVAL_MS / 3600000}h, ${LOOKBACK_DAYS}-day lookback)`);
}
