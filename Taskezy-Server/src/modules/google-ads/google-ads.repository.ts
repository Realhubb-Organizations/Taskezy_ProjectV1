import { pool, query } from "../../db/pool";

// No token storage here, unlike meta.repository.ts — auth is one
// server-level credential from env (see config/env.ts), not per-connection.

export interface UpsertAccountInput {
  id: string;
  name: string;
}

export async function upsertAccount(input: UpsertAccountInput): Promise<void> {
  await pool.query(
    `INSERT INTO google_ads_accounts (id, name, status)
     VALUES ($1, $2, 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE'`,
    [input.id, input.name]
  );
}

export interface GoogleAdsAccountRow {
  id: string;
  name: string;
  status: "ACTIVE" | "DISCONNECTED";
  created_at: string;
}

export async function listAccounts(): Promise<GoogleAdsAccountRow[]> {
  const { rows } = await query<GoogleAdsAccountRow>(`SELECT id, name, status, created_at FROM google_ads_accounts ORDER BY name`);
  return rows;
}

/** Marks every currently-stored account DISCONNECTED before a sync cycle re-marks the ones still linked ACTIVE — keeps the cache honest if an account is unlinked in Google Ads. */
export async function markAllDisconnected(): Promise<void> {
  await pool.query(`UPDATE google_ads_accounts SET status = 'DISCONNECTED' WHERE status = 'ACTIVE'`);
}

export interface UpsertCampaignInput {
  id: string;
  accountId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

/**
 * property_id is resolved by matching the campaign name against
 * property_google_campaigns — mirrors meta.repository.ts's upsertCampaign.
 * Returns it so the sync job can stamp the same property onto every spend
 * row for this campaign without a second lookup.
 */
export async function upsertCampaign(input: UpsertCampaignInput): Promise<string | null> {
  const { rows } = await pool.query<{ property_id: string | null }>(
    `INSERT INTO google_ads_campaigns (id, account_id, name, status, property_id)
     VALUES ($1, $2, $3, $4, (SELECT property_id FROM property_google_campaigns WHERE campaign_name = $3))
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       status = EXCLUDED.status,
       property_id = EXCLUDED.property_id
     RETURNING property_id`,
    [input.id, input.accountId, input.name, input.status]
  );
  return rows[0]?.property_id ?? null;
}

export interface UpsertSpendInput {
  campaignId: string;
  accountName: string;
  propertyId: string | null;
  spendDate: string;
  spend: number;
  leadsGenerated: number;
}

export async function upsertSpendRecord(input: UpsertSpendInput): Promise<void> {
  await pool.query(
    `INSERT INTO ad_spend_records (platform, account_name, property_id, spend_date, spend, leads_generated, google_campaign_id)
     VALUES ('GOOGLE', $1, $2, $3, $4, $5, $6)
     ON CONFLICT (google_campaign_id, spend_date) WHERE google_campaign_id IS NOT NULL DO UPDATE SET
       account_name = EXCLUDED.account_name,
       property_id = EXCLUDED.property_id,
       spend = EXCLUDED.spend,
       leads_generated = EXCLUDED.leads_generated`,
    [input.accountName, input.propertyId, input.spendDate, input.spend, input.leadsGenerated, input.campaignId]
  );
}

// --- Ad groups / ads / per-ad spend (Campaign Deep Dive's real Ad Set
// Name/Ad creative Name columns for Google — mirrors the Meta side in
// meta.repository.ts; see jobs/googleAdsSpendSync.ts) ---

export interface UpsertAdGroupInput {
  id: string;
  campaignId: string;
  name: string;
  status?: string;
}

export async function upsertAdGroup(input: UpsertAdGroupInput): Promise<void> {
  await pool.query(
    `INSERT INTO google_ad_groups (id, campaign_id, name, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id,
       name = EXCLUDED.name,
       status = EXCLUDED.status`,
    [input.id, input.campaignId, input.name, input.status ?? null]
  );
}

export interface UpsertGoogleAdInput {
  id: string;
  campaignId: string;
  adGroupId: string;
  name?: string;
  adType?: string;
  status?: string;
}

export async function upsertAd(input: UpsertGoogleAdInput): Promise<void> {
  await pool.query(
    `INSERT INTO google_ads (id, campaign_id, ad_group_id, name, ad_type, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id,
       ad_group_id = EXCLUDED.ad_group_id,
       name = EXCLUDED.name,
       ad_type = EXCLUDED.ad_type,
       status = EXCLUDED.status`,
    [input.id, input.campaignId, input.adGroupId, input.name ?? null, input.adType ?? null, input.status ?? null]
  );
}

export interface UpsertGoogleAdLevelSpendInput {
  adId: string;
  spendDate: string;
  spend: number;
  leadsGenerated: number;
}

export async function upsertAdLevelSpendRecord(input: UpsertGoogleAdLevelSpendInput): Promise<void> {
  await pool.query(
    `INSERT INTO google_ad_level_spend_records (google_ad_id, spend_date, spend, leads_generated)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_ad_id, spend_date) DO UPDATE SET
       spend = EXCLUDED.spend,
       leads_generated = EXCLUDED.leads_generated`,
    [input.adId, input.spendDate, input.spend, input.leadsGenerated]
  );
}

// Field names are deliberately identical to meta.repository's
// AdLevelSpendRow (ad_id, ad_set_name, etc.), aliasing Google's own
// "ad group" as ad_set_name — same real concept as Meta's ad set, just
// Google's name for it — so a row with the same field name means the same
// thing regardless of platform, and the frontend never has to branch on
// platform just to read one. creative_name has no Google equivalent (no
// distinct creative object the way Meta has); ad_type is kept as its own
// real field instead of invented as a fake creative_name.
export interface GoogleAdLevelSpendRow {
  platform: "GOOGLE";
  ad_id: string;
  ad_name: string | null;
  ad_type: string | null;
  ad_set_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: "ACTIVE" | "INACTIVE";
  spend_date: string;
  spend: string;
  leads_generated: number;
}

/**
 * Real per-ad, per-day spend/conversions with each row's real ad group/ad
 * name attached — mirrors meta.repository.listAdLevelSpend's shape and
 * un-aggregated grain (one row per ad per day), so the frontend applies
 * the same Date-Range logic to both.
 */
export async function listAdLevelSpend(): Promise<GoogleAdLevelSpendRow[]> {
  const { rows } = await query<GoogleAdLevelSpendRow>(
    `SELECT
       'GOOGLE' AS platform,
       a.google_ad_id AS ad_id, ga.name AS ad_name, ga.ad_type,
       gag.name AS ad_set_name,
       gc.id AS campaign_id, gc.name AS campaign_name, gc.status AS campaign_status,
       a.spend_date, a.spend, a.leads_generated
     FROM google_ad_level_spend_records a
     JOIN google_ads ga ON ga.id = a.google_ad_id
     JOIN google_ad_groups gag ON gag.id = ga.ad_group_id
     JOIN google_ads_campaigns gc ON gc.id = ga.campaign_id
     ORDER BY a.spend_date`
  );
  return rows;
}
