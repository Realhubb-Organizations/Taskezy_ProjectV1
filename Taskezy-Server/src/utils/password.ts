import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

// Compatible with the bcrypt hashes already seeded via Postgres pgcrypto
// (crypt(password, gen_salt('bf'))) — same bcrypt algorithm either side.
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
