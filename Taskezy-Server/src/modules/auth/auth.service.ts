import { query } from "../../db/pool";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { verifyPassword } from "../../utils/password";
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
    `SELECT id, first_name, last_name, email, role, department, role_type, designation, status, password_hash
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
    `SELECT id, first_name, last_name, email, role, department, role_type, designation, status, password_hash
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

export async function getProfile(userId: string): Promise<Omit<UserRow, "password_hash">> {
  const { rows } = await query<UserRow>(
    `SELECT id, first_name, last_name, email, role, department, role_type, designation, status, password_hash
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user) throw ApiError.notFound("User not found");
  return stripPasswordHash(user);
}
