import "dotenv/config";
import { z } from "zod";

// Fail fast at boot if config is missing/malformed — never discover a missing
// secret from a runtime crash under real traffic.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  CORS_ALLOWED_ORIGINS: z.string().default(""),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  // Meta (Facebook/Instagram) Lead Ads real-time integration — see src/modules/meta.
  META_APP_ID: z.string().min(1, "META_APP_ID is required"),
  META_APP_SECRET: z.string().min(1, "META_APP_SECRET is required"),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1, "META_WEBHOOK_VERIFY_TOKEN is required"),
  META_OAUTH_REDIRECT_URI: z.string().url("META_OAUTH_REDIRECT_URI must be a full URL, e.g. https://api.taskezy.in/api/v1/meta/callback"),
  META_GRAPH_API_VERSION: z.string().default("v25.0"),
  // 32 raw bytes, base64-encoded — generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  TOKEN_ENCRYPTION_KEY: z.string().min(1, "TOKEN_ENCRYPTION_KEY is required"),
  // Where to send the admin's browser back to after the OAuth callback finishes, e.g. https://taskezy.in/dashboard/settings
  FRONTEND_URL: z.string().url("FRONTEND_URL is required"),

  // Google Ads real campaign spend sync — see src/modules/google-ads. Unlike
  // Meta, this is one server-level credential (Manager/MCC account model),
  // not per-connection OAuth — a single refresh token covers every linked
  // client ad account.
  GOOGLE_ADS_CLIENT_ID: z.string().min(1, "GOOGLE_ADS_CLIENT_ID is required"),
  GOOGLE_ADS_CLIENT_SECRET: z.string().min(1, "GOOGLE_ADS_CLIENT_SECRET is required"),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().min(1, "GOOGLE_ADS_DEVELOPER_TOKEN is required"),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().min(1, "GOOGLE_ADS_REFRESH_TOKEN is required"),
  // The Manager (MCC) account's Customer ID, digits only, e.g. 3349503286
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().regex(/^\d+$/, "GOOGLE_ADS_LOGIN_CUSTOMER_ID must be digits only, no dashes"),
  GOOGLE_ADS_API_VERSION: z.string().default("v25") // v18 is sunset — see google-ads-client.ts
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  corsAllowedOrigins: parsed.data.CORS_ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
};
