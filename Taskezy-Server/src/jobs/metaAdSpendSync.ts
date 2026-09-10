import { logger } from "../utils/logger";
import {
  getCampaignDailyInsights,
  getCampaigns,
  extractLeadCount,
  isCampaignActive,
  getAdSetsForCampaign,
  getAdsForCampaign,
  getAdDailyInsights
} from "../modules/meta/meta-client";
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
 *
 * Also pulls each campaign's real ad sets and ads (with each ad's own
 * creative name), and real per-ad daily spend/leads — one insights call per
 * ad, since Meta doesn't offer a single call for a campaign's whole ad-set/
 * ad tree the way it does for campaign-level daily insights. Feeds Campaign
 * Deep Dive's Ad Set Name / Ad creative Name columns and a real per-ad CPL.
 */
async function syncOnce(): Promise<void> {
  const adAccounts = await metaRepo.listActiveAdAccounts();
  if (adAccounts.length === 0) {
    logger.info("Meta ad spend sync: no active ad accounts to sync — skipping this cycle");
    return;
  }

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
      const status = isCampaignActive(campaign) ? "ACTIVE" : "INACTIVE";
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

      // Real ad-set/ad/creative names + real per-ad daily spend/leads, for
      // Campaign Deep Dive's Ad Set Name / Ad creative Name columns and a
      // real per-ad CPL breakdown. Kept in its own try/catch, separate from
      // the campaign-level insights above, so a failure here (e.g. an ad
      // account missing ads_management on some ad sets) never blocks the
      // campaign-level spend sync that already worked before this existed.
      try {
        const adSets = await getAdSetsForCampaign(campaign.id, account.userToken);
        for (const adSet of adSets) {
          await metaRepo.upsertAdSet({ id: adSet.id, campaignId: campaign.id, name: adSet.name, status: adSet.status });
        }

        const ads = await getAdsForCampaign(campaign.id, account.userToken);
        for (const ad of ads) {
          await metaRepo.upsertAd({
            id: ad.id,
            campaignId: campaign.id,
            adsetId: ad.adset_id,
            name: ad.name,
            creativeId: ad.creative?.id,
            creativeName: ad.creative?.name,
            status: ad.status
          });

          try {
            const adInsights = await getAdDailyInsights(ad.id, account.userToken, since, until);
            for (const day of adInsights) {
              await metaRepo.upsertAdLevelSpendRecord({
                adId: ad.id,
                spendDate: day.date_start,
                spend: Number(day.spend) || 0,
                leadsGenerated: extractLeadCount(day)
              });
            }
          } catch (err) {
            logger.error({ err, adId: ad.id }, "Could not sync insights for ad — skipping this ad, will retry next cycle");
          }
        }
      } catch (err) {
        logger.error({ err, campaignId: campaign.id }, "Could not sync ad sets/ads for campaign — skipping, will retry next cycle");
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
