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
