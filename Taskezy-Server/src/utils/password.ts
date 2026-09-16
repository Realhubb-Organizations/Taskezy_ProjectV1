import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

// Native bcrypt (libbcrypt via a compiled addon), not bcryptjs — bcryptjs's
// pure-JS hashing runs on Node's single main thread and was measurably
// blocking the event loop for ~450-550ms per real login (see server logs),
// stalling every other concurrent request on the box for that whole
// window. Native bcrypt offloads the actual hashing to libuv's thread pool,
// so one slow login no longer stalls everyone else. Same algorithm/hash
// format as bcryptjs (and Postgres pgcrypto's crypt(password,
// gen_salt('bf'))) — existing password hashes in the database keep working
// unchanged, nothing to migrate.
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
