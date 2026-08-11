import { env } from "../../config/env";
import { logger } from "../../utils/logger";

const API_BASE = `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// One server-level credential (the Manager/MCC account's refresh token, see
// config/env.ts) — unlike Meta, there is no per-connection OAuth here, so a
// single cached access token covers every linked client ad account.
let cachedAccessToken: { token: string; expiresAt: number } | undefined;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    logger.error({ googleError: body.error, description: body.error_description }, "Google Ads token refresh failed");
    throw new Error(body.error_description ?? "Google Ads token refresh failed");
  }
  cachedAccessToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedAccessToken.token;
}

interface GaqlResponse<T> {
  results?: T[];
  nextPageToken?: string;
  error?: { message: string };
}

/**
 * Runs one GAQL query against a given customer (ad account or the MCC
 * itself), paginating until exhausted. `loginCustomerId` is always the MCC —
 * required on every call so Google knows which manager hierarchy is asking,
 * even when querying a client account's own data.
 */
async function gaqlSearch<T>(customerId: string, gaql: string): Promise<T[]> {
  const accessToken = await getAccessToken();
  const results: T[] = [];
  let pageToken: string | undefined;

  do {
    const res = await fetch(`${API_BASE}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
        "login-customer-id": env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
      },
      body: JSON.stringify({ query: gaql, pageToken, pageSize: 1000 })
    });
    const body = (await res.json()) as GaqlResponse<T>;
    if (!res.ok || body.error) {
      logger.error({ customerId, gaql, googleError: body.error }, "Google Ads GAQL query failed");
      throw new Error(body.error?.message ?? `Google Ads query against ${customerId} failed with status ${res.status}`);
    }
    results.push(...(body.results ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return results;
}

export interface GoogleAdsLinkedAccount {
  customerClient: { id: string; descriptiveName?: string; status: string; manager: boolean; level: string };
}

/** Every client account linked under the MCC — auto-discovered, never entered manually in the app. */
export async function listLinkedAccounts(): Promise<{ id: string; name: string }[]> {
  const rows = await gaqlSearch<GoogleAdsLinkedAccount>(
    env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    `SELECT customer_client.id, customer_client.descriptive_name, customer_client.status, customer_client.manager, customer_client.level
     FROM customer_client`
  );
  return rows
    // level 0 is the MCC itself; exclude sub-manager accounts and anything not enabled/linked.
    .filter(r => r.customerClient.level !== "0" && !r.customerClient.manager && r.customerClient.status === "ENABLED")
    .map(r => ({ id: r.customerClient.id, name: r.customerClient.descriptiveName || r.customerClient.id }));
}

export interface GoogleAdsCampaignRow {
  campaign: { id: string; name: string; status: string };
}

export async function listCampaigns(customerId: string): Promise<{ id: string; name: string; status: string }[]> {
  const rows = await gaqlSearch<GoogleAdsCampaignRow>(customerId, `SELECT campaign.id, campaign.name, campaign.status FROM campaign`);
  return rows.map(r => ({ id: r.campaign.id, name: r.campaign.name, status: r.campaign.status }));
}

export interface GoogleAdsDailyStatRow {
  campaign: { id: string };
  segments: { date: string };
  metrics: { costMicros?: string; conversions?: number };
}

export interface GoogleAdsDailyStat {
  campaignId: string;
  date: string;
  spend: number;
  conversions: number;
}

/** One call per account covers every campaign's daily spend/conversions for the window — cheaper than one call per campaign. */
export async function getAccountDailyStats(customerId: string, since: string, until: string): Promise<GoogleAdsDailyStat[]> {
  const rows = await gaqlSearch<GoogleAdsDailyStatRow>(
    customerId,
    `SELECT campaign.id, segments.date, metrics.cost_micros, metrics.conversions
     FROM campaign
     WHERE segments.date BETWEEN '${since}' AND '${until}'`
  );
  return rows.map(r => ({
    campaignId: r.campaign.id,
    date: r.segments.date,
    spend: Number(r.metrics.costMicros ?? 0) / 1_000_000, // Google reports cost in micros (1,000,000 = 1 currency unit)
    conversions: Math.round(r.metrics.conversions ?? 0)
  }));
}
