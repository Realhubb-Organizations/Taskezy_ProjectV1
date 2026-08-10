import { pool, query } from "../../db/pool";
import { decryptSecret, encryptSecret } from "../../utils/crypto";

export interface MetaConnectionRow {
  id: string;
  page_id: string;
  page_name: string;
  ad_account_id: string | null;
  status: "ACTIVE" | "DISCONNECTED";
  connected_by: string;
  created_at: string;
}

const SAFE_SELECT = `SELECT id, page_id, page_name, ad_account_id, status, connected_by, created_at FROM meta_connections`;

export async function listConnections(): Promise<MetaConnectionRow[]> {
  const { rows } = await query<MetaConnectionRow>(`${SAFE_SELECT} ORDER BY created_at DESC`);
  return rows;
}

export interface UpsertConnectionInput {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  connectedBy: string;
}

/** Encrypts the Page token before it ever reaches a query parameter. */
export async function upsertConnection(input: UpsertConnectionInput): Promise<void> {
  const { ciphertext, iv, authTag } = encryptSecret(input.pageAccessToken);
  await pool.query(
    `INSERT INTO meta_connections (page_id, page_name, page_token_encrypted, page_token_iv, page_token_tag, connected_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
     ON CONFLICT (page_id) DO UPDATE SET
       page_name = EXCLUDED.page_name,
       page_token_encrypted = EXCLUDED.page_token_encrypted,
       page_token_iv = EXCLUDED.page_token_iv,
       page_token_tag = EXCLUDED.page_token_tag,
       connected_by = EXCLUDED.connected_by,
       status = 'ACTIVE'`,
    [input.pageId, input.pageName, ciphertext, iv, authTag, input.connectedBy]
  );
}

export interface ActiveConnection {
  pageToken: string;
  connectedBy: string;
  pageName: string;
}

/** Looks up an ACTIVE connection by Page ID for webhook processing — decrypted token, the admin new leads should land on, and the Page name (for the lead's Meta footprint). */
export async function getActiveConnectionByPageId(pageId: string): Promise<ActiveConnection | undefined> {
  const { rows } = await query<{ page_token_encrypted: string; page_token_iv: string; page_token_tag: string; connected_by: string; page_name: string }>(
    `SELECT page_token_encrypted, page_token_iv, page_token_tag, connected_by, page_name FROM meta_connections WHERE page_id = $1 AND status = 'ACTIVE'`,
    [pageId]
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    pageToken: decryptSecret({ ciphertext: row.page_token_encrypted, iv: row.page_token_iv, authTag: row.page_token_tag }),
    connectedBy: row.connected_by,
    pageName: row.page_name
  };
}

export async function disconnect(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`UPDATE meta_connections SET status = 'DISCONNECTED' WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// --- Ad accounts (real campaign spend sync — see jobs/metaAdSpendSync.ts) ---

export interface UpsertAdAccountInput {
  id: string;
  name: string;
  connectedBy: string;
  userToken: string;
}

/** Encrypts the long-lived USER token before it ever reaches a query parameter — distinct from Page tokens, needed for Insights/campaign reads. */
export async function upsertAdAccount(input: UpsertAdAccountInput): Promise<void> {
  const { ciphertext, iv, authTag } = encryptSecret(input.userToken);
  await pool.query(
    `INSERT INTO meta_ad_accounts (id, name, connected_by, user_token_encrypted, user_token_iv, user_token_tag, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       connected_by = EXCLUDED.connected_by,
       user_token_encrypted = EXCLUDED.user_token_encrypted,
       user_token_iv = EXCLUDED.user_token_iv,
       user_token_tag = EXCLUDED.user_token_tag,
       status = 'ACTIVE'`,
    [input.id, input.name, input.connectedBy, ciphertext, iv, authTag]
  );
}

export interface ActiveAdAccount {
  id: string;
  name: string;
  userToken: string;
}

/** Every ACTIVE ad account with its decrypted user token — the sync job's starting point. */
export async function listActiveAdAccounts(): Promise<ActiveAdAccount[]> {
  const { rows } = await query<{ id: string; name: string; user_token_encrypted: string; user_token_iv: string; user_token_tag: string }>(
    `SELECT id, name, user_token_encrypted, user_token_iv, user_token_tag FROM meta_ad_accounts WHERE status = 'ACTIVE'`
  );
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    userToken: decryptSecret({ ciphertext: row.user_token_encrypted, iv: row.user_token_iv, authTag: row.user_token_tag })
  }));
}

export interface UpsertCampaignInput {
  id: string;
  adAccountId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

/**
 * property_id is resolved by matching the campaign name against
 * property_meta_campaigns — the same table Meta lead auto-assignment already
 * uses. Returns it so the caller (the spend sync job) can stamp the same
 * property onto every spend row for this campaign without a second lookup.
 */
export async function upsertCampaign(input: UpsertCampaignInput): Promise<string | null> {
  const { rows } = await pool.query<{ property_id: string | null }>(
    `INSERT INTO meta_campaigns (id, ad_account_id, name, status, property_id)
     VALUES ($1, $2, $3, $4, (SELECT property_id FROM property_meta_campaigns WHERE campaign_name = $3))
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       status = EXCLUDED.status,
       property_id = EXCLUDED.property_id
     RETURNING property_id`,
    [input.id, input.adAccountId, input.name, input.status]
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
    `INSERT INTO ad_spend_records (platform, account_name, property_id, spend_date, spend, leads_generated, meta_campaign_id)
     VALUES ('META', $1, $2, $3, $4, $5, $6)
     ON CONFLICT (meta_campaign_id, spend_date) WHERE meta_campaign_id IS NOT NULL DO UPDATE SET
       account_name = EXCLUDED.account_name,
       property_id = EXCLUDED.property_id,
       spend = EXCLUDED.spend,
       leads_generated = EXCLUDED.leads_generated`,
    [input.accountName, input.propertyId, input.spendDate, input.spend, input.leadsGenerated, input.campaignId]
  );
}
