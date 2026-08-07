import { query } from "../../db/pool";
import { ApiError } from "../../utils/ApiError";
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

async function issueTokenPair(user: UserRow): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({
    sub: user.id,
    name: `${user.first_name}${user.last_name ? " " + user.last_name : ""}`,
    role: user.role,
    department: user.department,
    roleType: user.role_type
  });
  const refreshToken = generateRefreshToken();

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, hashRefreshToken(refreshToken), refreshTokenExpiryDate()]
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

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(refreshToken);

  const { rows } = await query<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
    `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash]
  );
  const stored = rows[0];

  if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const { rows: userRows } = await query<UserRow>(
    `SELECT id, first_name, last_name, email, role, department, role_type, designation, status, password_hash
     FROM users WHERE id = $1`,
    [stored.user_id]
  );
  const user = userRows[0];
  if (!user || user.status !== "ACTIVE") {
    throw ApiError.unauthorized("Account is no longer active");
  }

  // Rotate: revoke the used refresh token and issue a fresh pair. A refresh
  // token that's been used once is never valid again — this limits the
  // damage if a token is ever leaked/stolen.
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [stored.id]);

  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user);
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
