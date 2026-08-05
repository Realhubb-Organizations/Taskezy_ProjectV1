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
}

/** Looks up an ACTIVE connection by Page ID for webhook processing — decrypted token + the admin new leads should land on. */
export async function getActiveConnectionByPageId(pageId: string): Promise<ActiveConnection | undefined> {
  const { rows } = await query<{ page_token_encrypted: string; page_token_iv: string; page_token_tag: string; connected_by: string }>(
    `SELECT page_token_encrypted, page_token_iv, page_token_tag, connected_by FROM meta_connections WHERE page_id = $1 AND status = 'ACTIVE'`,
    [pageId]
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    pageToken: decryptSecret({ ciphertext: row.page_token_encrypted, iv: row.page_token_iv, authTag: row.page_token_tag }),
    connectedBy: row.connected_by
  };
}

export async function disconnect(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`UPDATE meta_connections SET status = 'DISCONNECTED' WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
