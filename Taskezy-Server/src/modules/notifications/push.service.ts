import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../../config/env";
import { query } from "../../db/pool";
import { logger } from "../../utils/logger";

const DEAD_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);
let warnedDisabled = false;

export interface PushPayload {
  title: string;
  body: string;
  link: string | null;
  notificationId: string;
  category: string;
  system: string;
}

/** Mirrors frontend's notificationSound.ts resolveNotificationSoundKind mapping, for FCM channel routing. */
function resolvePushChannelId(category: string, system: string): string {
  if (category === "NEW_LEAD") return "leads";
  if (category === "REMINDER") return "reminder";
  if (system === "HRMS") return "hrms";
  if (system === "FINANCE") return "finance";
  return "activity";
}

/** Sends a push to every registered device of a user. Never throws; failures are logged and swallowed. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const b64 = env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      logger.warn("FIREBASE_SERVICE_ACCOUNT_B64 not set; push notifications are disabled");
    }
    return;
  }

  try {
    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, "base64").toString("utf8"))) });
    }

    const { rows } = await query<{ token: string }>(`SELECT token FROM user_devices WHERE user_id = $1`, [userId]);
    if (rows.length === 0) return;
    const tokens = rows.map((r) => r.token);

    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: { link: payload.link ?? "", notificationId: payload.notificationId },
      android: { priority: "high", notification: { channelId: resolvePushChannelId(payload.category, payload.system) } }
    });

    const deadTokens = tokens.filter((_, i) => {
      const code = res.responses[i].error?.code;
      return code !== undefined && DEAD_TOKEN_CODES.has(code);
    });
    if (deadTokens.length > 0) {
      await query(`DELETE FROM user_devices WHERE token = ANY($1)`, [deadTokens]);
    }
  } catch (err) {
    // Deliberately log only the error name/code: parse and SDK errors can echo key or token fragments.
    logger.error({ errName: (err as Error)?.name, code: (err as { code?: string })?.code }, "Push send failed");
  }
}
