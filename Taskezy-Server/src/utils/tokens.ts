import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string; // user id
  name: string;
  role: string;
  department: string | null;
  roleType: string | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

// Refresh tokens are high-entropy random strings, not signed JWTs — the
// server is the only thing that ever needs to validate them (by exact hash
// match against refresh_tokens.token_hash), so there's no need for JWT's
// self-describing claims here. SHA-256 (not bcrypt) is correct for hashing
// them: they're already high-entropy, so a deterministic hash usable in an
// indexed `WHERE token_hash = $1` lookup is both sufficient and necessary —
// bcrypt's per-hash random salt makes that kind of exact-match query impossible.
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiryDate(): Date {
  const match = /^(\d+)([dhm])$/.exec(env.JWT_REFRESH_EXPIRES_IN);
  const amount = match ? Number(match[1]) : 30;
  const unit = match ? match[2] : "d";
  const msPerUnit = unit === "d" ? 86400000 : unit === "h" ? 3600000 : 60000;
  return new Date(Date.now() + amount * msPerUnit);
}
