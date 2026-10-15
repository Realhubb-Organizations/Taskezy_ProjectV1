import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env";
import { query } from "../../db/pool";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { hashPassword, verifyPassword } from "../../utils/password";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiryDate,
  signAccessToken
} from "../../utils/tokens";

interface UserRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  role: string;
  department: string | null;
  role_type: string | null;
  designation: string | null;
  status: string;
  password_hash: string;
  must_reset_password: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: Omit<UserRow, "password_hash">;
}

function stripPasswordHash(user: UserRow): Omit<UserRow, "password_hash"> {
  const { password_hash: _password_hash, ...rest } = user;
  return rest;
}

// familyId links every refresh token descended from one login together —
// omit it (e.g. at login) to start a new family; pass the prior token's
// family_id (e.g. at rotation) to keep extending the same one. This is what
// lets refresh() tell "a legitimate next rotation" apart from "a replay of a
// token that's already been rotated past" (see refresh() below).
async function issueTokenPair(
  user: UserRow,
  familyId?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({
    sub: user.id,
    name: `${user.first_name}${user.last_name ? " " + user.last_name : ""}`,
    role: user.role,
    department: user.department,
    roleType: user.role_type
  });
  const refreshToken = generateRefreshToken();

  await query(
    familyId
      ? `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id) VALUES ($1, $2, $3, $4)`
      : `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    familyId
      ? [user.id, hashRefreshToken(refreshToken), refreshTokenExpiryDate(), familyId]
      : [user.id, hashRefreshToken(refreshToken), refreshTokenExpiryDate()]
  );

  return { accessToken, refreshToken };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  // Case-insensitive — email addresses aren't case-sensitive in practice,
  // and an admin typing "Neha@..." at user-creation time while Neha logs in
  // with "neha@..." shouldn't produce a login failure.
  const { rows } = await query<UserRow>(
    `SELECT id, first_name, last_name, email, role, department, role_type, designation, status, password_hash, must_reset_password
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  const user = rows[0];

  // Same generic error whether the email doesn't exist or the password is
  // wrong — never reveal which one it was, that's a user-enumeration leak.
  if (!user || user.status !== "ACTIVE") {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const { accessToken, refreshToken } = await issueTokenPair(user);
  return { accessToken, refreshToken, user: stripPasswordHash(user) };
}

// "Sign in with Google". The browser (Google Identity Services) hands us a
// Google-signed ID token; we verify it with Google's keys, then log in the
// matching EXISTING Taskezy user exactly like a password login. Rules:
//  - only verified @<GOOGLE_SIGNIN_ALLOWED_DOMAIN> Google accounts;
//  - only an existing ACTIVE user whose login email or company email is
//    that Google email (no self sign-up), or who already linked this
//    Google account earlier (users.google_sub, migration 034);
//  - the temporary-password reset is skipped: Google already proved who
//    they are (they can still change their password from the app).
const googleClient = new OAuth2Client();

const USER_COLUMNS = `id, first_name, last_name, email, role, department, role_type, designation, status, password_hash, must_reset_password`;

export async function loginWithGoogle(credential: string): Promise<AuthResult> {
  if (!env.GOOGLE_SIGNIN_CLIENT_ID) {
    throw ApiError.badRequest("Google sign-in is not set up yet.");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.GOOGLE_SIGNIN_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    logger.warn({ err }, "Google sign-in: ID token verification failed");
    throw ApiError.unauthorized("Google sign-in failed. Please try again.");
  }
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw ApiError.unauthorized("Google sign-in failed. Please try again.");
  }

  const domain = env.GOOGLE_SIGNIN_ALLOWED_DOMAIN.toLowerCase();
  const googleEmail = payload.email.toLowerCase();
  // `hd` is only present for Workspace accounts — together with the email
  // suffix this rules out a personal Gmail that merely looks similar.
  if (payload.hd?.toLowerCase() !== domain || !googleEmail.endsWith(`@${domain}`)) {
    throw ApiError.forbidden(`Please use your @${domain} Google account.`);
  }

  const { rows } = await query<UserRow & { google_sub: string | null; match: number }>(
    `SELECT ${USER_COLUMNS}, google_sub,
            CASE WHEN google_sub = $1 THEN 0 WHEN LOWER(email) = $2 THEN 1 ELSE 2 END AS match
     FROM users
     WHERE google_sub = $1 OR LOWER(email) = $2 OR LOWER(company_email) = $2
     ORDER BY match`,
    [payload.sub, googleEmail]
  );
  const best = rows[0];
  if (!best) {
    throw ApiError.forbidden(`No Taskezy account is linked to ${googleEmail}. Please ask your admin.`);
  }
  // Two different users matching only by email would make the pick a guess.
  if (best.match > 0 && rows.filter(r => r.match === best.match).length > 1) {
    logger.warn({ googleEmail }, "Google sign-in: email matches more than one user");
    throw ApiError.forbidden(`More than one Taskezy account uses ${googleEmail}. Please ask your admin.`);
  }
  if (best.google_sub && best.google_sub !== payload.sub) {
    throw ApiError.forbidden("This Taskezy account is linked to a different Google account.");
  }
  if (best.status !== "ACTIVE") {
    throw ApiError.forbidden("Your Taskezy account is inactive. Please ask your admin.");
  }

  if (!best.google_sub) {
    await query(`UPDATE users SET google_sub = $1, updated_at = now() WHERE id = $2 AND google_sub IS NULL`, [payload.sub, best.id]);
    logger.info({ userId: best.id }, "Google sign-in: linked Google account to user");
  }

  const { google_sub: _googleSub, match: _match, ...user } = best;
  const { accessToken, refreshToken } = await issueTokenPair(user);
  return { accessToken, refreshToken, user: { ...stripPasswordHash(user), must_reset_password: false } };
}

// How long after a token's rotation a reuse of that same (now-revoked)
// token is still treated as a benign race rather than theft — see the
// grace-window branch in refresh() below. Long enough to absorb two
// near-simultaneous legitimate requests sharing one refresh token (two
// open tabs, or a burst of parallel API calls — e.g. loadAllRealData's
// ~14 concurrent fetches — that all hit a 401 together and race to
// refresh before the frontend's own in-tab de-dupe can apply); short
// enough that an attacker replaying a genuinely stolen token any
// meaningful time later still trips full family revocation below.
const REUSE_GRACE_MS = 10_000;

async function userForRefresh(userId: string): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `SELECT id, first_name, last_name, email, role, department, role_type, designation, status, password_hash, must_reset_password
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user || user.status !== "ACTIVE") {
    throw ApiError.unauthorized("Account is no longer active");
  }
  return user;
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(refreshToken);

  // Atomic check-and-claim, not a SELECT followed by a separate UPDATE: the
  // old two-step version let two concurrent requests with the same token
  // both pass the validity check before either had revoked it, each then
  // minting its own new token pair from the same original (a classic
  // check-then-act race). Collapsing it into one UPDATE closes that —
  // Postgres row-locks the statement, so of two concurrent callers, only
  // the first can ever match `revoked_at IS NULL`; the second gets zero
  // rows back here, full stop, no window for both to succeed.
  const { rows: claimed } = await query<{ id: string; user_id: string; family_id: string }>(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING id, user_id, family_id`,
    [tokenHash]
  );
  const claim = claimed[0];

  if (!claim) {
    // Didn't claim it. Could be a forged/garbage token, an expired one, or —
    // the interesting case — a token that WAS valid but has already been
    // rotated past. That last case is a replay, but replay alone doesn't
    // prove theft: the atomic claim above means losing that race is the
    // *expected* outcome for the second of two near-simultaneous
    // legitimate requests sharing one refresh token, not just a stolen-
    // token scenario. Telling them apart: a genuine thief's replay happens
    // whenever they get around to using the token they captured — no
    // reason it'd land within milliseconds of the legitimate rotation. A
    // same-client race always does. So a reuse spotted within
    // REUSE_GRACE_MS of the token's own revocation is treated as that
    // benign race — the loser just gets its own fresh pair on the same
    // family, same as if it had won — while a reuse any later than that
    // still gets the full family revocation: the strongest signal
    // available that this token was stolen and used by someone other than
    // whoever is holding it now. Revoking the whole family forces both the
    // thief and the legitimate client to re-authenticate, since rejecting
    // only the replay would leave a real thief in control of their own
    // already-rotated session.
    const { rows: existing } = await query<{ user_id: string; family_id: string; revoked_at: string }>(
      `SELECT user_id, family_id, revoked_at FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NOT NULL`,
      [tokenHash]
    );
    const prior = existing[0];
    if (prior && Date.now() - new Date(prior.revoked_at).getTime() <= REUSE_GRACE_MS) {
      const user = await userForRefresh(prior.user_id);
      const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user, prior.family_id);
      return { accessToken, refreshToken: newRefreshToken, user: stripPasswordHash(user) };
    }
    if (prior) {
      await query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`,
        [prior.family_id]
      );
      logger.warn(
        { familyId: prior.family_id },
        "Refresh token reuse detected — revoked every active token in the session family"
      );
    }
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const user = await userForRefresh(claim.user_id);
  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user, claim.family_id);
  return { accessToken, refreshToken: newRefreshToken, user: stripPasswordHash(user) };
}

export async function logout(refreshToken: string): Promise<void> {
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    hashRefreshToken(refreshToken)
  ]);
}

// Self-service completion of the forced-password-reset flow: the user is
// already authenticated (they just logged in with their current/temp
// password), so this re-verifies that current password rather than trusting
// the access token alone — the same "prove you know the old one" requirement
// any password-change form has. Clears must_reset_password so the gate
// doesn't reappear on next login.
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const { rows } = await query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user) throw ApiError.notFound("User not found");

  const isValid = await verifyPassword(currentPassword, user.password_hash);
  if (!isValid) throw ApiError.unauthorized("Current password is incorrect");

  const passwordHash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash = $1, must_reset_password = false WHERE id = $2`, [
    passwordHash,
    userId
  ]);
}

export async function getProfile(userId: string): Promise<Omit<UserRow, "password_hash">> {
  const { rows } = await query<UserRow>(
    `SELECT id, first_name, last_name, email, role, department, role_type, designation, status, password_hash, must_reset_password
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user) throw ApiError.notFound("User not found");
  return stripPasswordHash(user);
}
