import crypto from "crypto";
import { env } from "../../config/env";
import { query } from "../../db/pool";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { isEmailEnabled, sendEmail } from "../../utils/mailer";

// Second step of password login: a 6-digit code emailed to the user's own
// mailbox (migration 037). Google sign-in doesn't use this — Google's own
// 2-Step Verification covers it.

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5; // wrong guesses per code
const MAX_RESENDS = 3; // per challenge
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_CHALLENGES_PER_HOUR = 5; // per user — each one sends an email
export const TRUSTED_DEVICE_DAYS = 30;

/** On whenever outgoing email is configured — the code has to reach the user somehow. */
export function isLoginOtpEnabled(): boolean {
  return isEmailEnabled();
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Keyed hash, bound to the challenge: a leaked login_otps table can't be
// brute-forced offline (1M codes) without the server secret.
function hashCode(challengeId: string, code: string): string {
  return crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${challengeId}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** "neha.c@realhubb.in" -> "ne****@realhubb.in" — enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

/** "Chrome on Android" etc. — only for the email wording and the trusted-device label. */
export function describeDevice(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Mac OS X/i.test(ua) ? "Mac"
    : /Windows/i.test(ua) ? "Windows" : /Linux/i.test(ua) ? "Linux" : "an unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${browser} on ${os}` : os;
}

// Worded the way verification-code emails usually are ("Here is your
// verification code: 123456", code as plain digits, near the top) — Gmail
// uses that to show its own "Copy code" button, and the first line doubles
// as the phone notification preview.
async function emailCode(to: string, firstName: string, code: string, device: string): Promise<void> {
  const subject = "Your Taskezy verification code";
  const text =
    `Here is your verification code: ${code}\n\n` +
    `Hi ${firstName}, enter this code in Taskezy to finish signing in.\n\n` +
    `It expires in ${CODE_TTL_MINUTES} minutes. Someone signed in with your password from ${device}.\n\n` +
    `If this wasn't you, don't share this code. Someone knows your password — change it in Taskezy ` +
    `or ask your admin to reset it.\n\n— Taskezy`;
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">` +
    `<p>Here is your verification code:</p>` +
    `<p style="font-size:28px;font-weight:bold;margin:8px 0">${code}</p>` +
    `<p>Hi ${escapeHtml(firstName)}, enter this code in Taskezy to finish signing in.</p>` +
    `<p>It expires in ${CODE_TTL_MINUTES} minutes. Someone signed in with your password from ${escapeHtml(device)}.</p>` +
    `<p style="color:#6b7280">If this wasn't you, don't share this code. Someone knows your password — ` +
    `change it in Taskezy or ask your admin to reset it.</p>` +
    `<p>— Taskezy</p></div>`;
  await sendEmail(to, subject, text, html);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

interface OtpUser {
  id: string;
  email: string;
  first_name: string;
}

/** Creates a challenge and emails its code. Returns the challenge id the browser sends back with the code. */
export async function startChallenge(user: OtpUser, userAgent: string | undefined): Promise<string> {
  const { rows } = await query<{ count: string }>(
    `SELECT count(*) FROM login_otps WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
    [user.id]
  );
  if (Number(rows[0].count) >= MAX_CHALLENGES_PER_HOUR) {
    throw ApiError.tooManyRequests("Too many login codes requested. Please try again in an hour.");
  }

  const challengeId = crypto.randomUUID();
  const code = generateCode();
  await query(
    `INSERT INTO login_otps (id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '${CODE_TTL_MINUTES} minutes')`,
    [challengeId, user.id, hashCode(challengeId, code)]
  );

  try {
    await emailCode(user.email, user.first_name, code, describeDevice(userAgent));
  } catch (err) {
    logger.error({ err, userId: user.id }, "Login OTP: sending the code email failed");
    await query(`DELETE FROM login_otps WHERE id = $1`, [challengeId]);
    throw ApiError.internal("We couldn't send your login code. Please try again in a moment.");
  }
  return challengeId;
}

/** Emails a fresh code for an open challenge (the old code stops working). */
export async function resendChallenge(challengeId: string, userAgent: string | undefined): Promise<void> {
  const code = generateCode();
  // One statement claims the resend, so two quick taps can't both send.
  const { rows } = await query<OtpUser>(
    `UPDATE login_otps o
     SET code_hash = $2, attempts = 0, resend_count = resend_count + 1, last_sent_at = now(),
         expires_at = now() + interval '${CODE_TTL_MINUTES} minutes'
     FROM users u
     WHERE o.id = $1 AND u.id = o.user_id AND o.consumed_at IS NULL
       AND o.resend_count < ${MAX_RESENDS}
       AND o.last_sent_at <= now() - interval '${RESEND_COOLDOWN_SECONDS} seconds'
     RETURNING u.id, u.email, u.first_name`,
    [challengeId, hashCode(challengeId, code)]
  );
  const user = rows[0];
  if (!user) {
    throw ApiError.badRequest("Can't send another code right now. Wait 30 seconds, or go back and sign in again.");
  }
  try {
    await emailCode(user.email, user.first_name, code, describeDevice(userAgent));
  } catch (err) {
    logger.error({ err, userId: user.id }, "Login OTP: re-sending the code email failed");
    throw ApiError.internal("We couldn't send your login code. Please try again in a moment.");
  }
}

/** Checks a code. Returns the user id once it matches; each challenge can be used only once. */
export async function verifyChallenge(challengeId: string, code: string): Promise<string> {
  // Counting the attempt and reading the hash in one statement keeps
  // parallel guesses from sharing an attempt.
  const { rows } = await query<{ user_id: string; code_hash: string; attempts: number }>(
    `UPDATE login_otps SET attempts = attempts + 1
     WHERE id = $1 AND consumed_at IS NULL AND expires_at > now() AND attempts < ${MAX_ATTEMPTS}
     RETURNING user_id, code_hash, attempts`,
    [challengeId]
  );
  const row = rows[0];
  if (!row) {
    throw ApiError.badRequest("This code is no longer valid. Please request a new code.");
  }

  if (!sameHash(row.code_hash, hashCode(challengeId, code))) {
    const left = MAX_ATTEMPTS - row.attempts;
    throw ApiError.badRequest(
      left > 0
        ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "Too many wrong attempts. Please request a new code."
    );
  }

  const { rowCount } = await query(
    `UPDATE login_otps SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`,
    [challengeId]
  );
  if (!rowCount) throw ApiError.badRequest("This code has already been used. Please sign in again.");
  return row.user_id;
}

function hashDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** "Trust this device": returns the raw token for the device's cookie. */
export async function trustDevice(userId: string, userAgent: string | undefined): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO trusted_devices (user_id, token_hash, device_label, expires_at)
     VALUES ($1, $2, $3, now() + interval '${TRUSTED_DEVICE_DAYS} days')`,
    [userId, hashDeviceToken(token), describeDevice(userAgent)]
  );
  return token;
}

/** True when this device was trusted by this same user and hasn't expired. */
export async function isTrustedDevice(userId: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { rowCount } = await query(
    `UPDATE trusted_devices SET last_used_at = now()
     WHERE token_hash = $1 AND user_id = $2 AND expires_at > now()`,
    [hashDeviceToken(token), userId]
  );
  return Boolean(rowCount);
}
