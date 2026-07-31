import { pool, query } from "../../db/pool";

export interface UserDirectoryRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  role: string;
  department: string | null;
  role_type: string | null;
  designation: string | null;
}

// Read-only directory (no password_hash) — used by other modules to resolve
// a real user UUID (e.g. leads.assigned_agent_id) instead of guessing one.
export async function findAllActive(): Promise<UserDirectoryRow[]> {
  const { rows } = await query<UserDirectoryRow>(
    `SELECT id, first_name, last_name, email, role, department, role_type, designation
     FROM users WHERE status = 'ACTIVE' ORDER BY first_name, last_name`
  );
  return rows;
}

export interface FullUserRow extends UserDirectoryRow {
  phone_number: string | null;
  employment_type: string | null;
  status: string;
  created_at: string;
}

const FULL_SELECT = `
  SELECT id, first_name, last_name, email, phone_number, role, department, role_type,
         employment_type, designation, status, created_at
  FROM users
`;

export async function findById(id: string): Promise<FullUserRow | undefined> {
  const { rows } = await query<FullUserRow>(`${FULL_SELECT} WHERE id = $1`, [id]);
  return rows[0];
}

export async function countAdmins(excludingId?: string): Promise<number> {
  const params: unknown[] = [];
  let where = `role = 'ADMIN' AND status = 'ACTIVE'`;
  if (excludingId) {
    params.push(excludingId);
    where += ` AND id != $${params.length}`;
  }
  const { rows } = await query<{ count: string }>(`SELECT count(*) FROM users WHERE ${where}`, params);
  return Number(rows[0]?.count ?? 0);
}

export interface CreateUserInput {
  firstName: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
  designation?: string;
  role: string;
  roleType?: string;
  employmentType?: string;
  department?: string;
  passwordHash: string; // already hashed by users.service.ts — never plaintext here
}

export async function create(input: CreateUserInput): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO users (first_name, last_name, email, company_email, phone_number, designation, role, role_type, employment_type, department, password_hash)
     VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      input.firstName, input.lastName ?? null, input.email, input.phoneNumber ?? null, input.designation ?? null,
      input.role, input.roleType ?? null, input.employmentType ?? null, input.department ?? null, input.passwordHash
    ]
  );
  return rows[0].id;
}

export interface EditUserInput {
  firstName?: string;
  lastName?: string;
  designation?: string;
  roleType?: string;
  department?: string;
  status?: string;
}

export async function update(id: string, input: EditUserInput): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const columnMap: Record<string, string> = {
    firstName: "first_name", lastName: "last_name", designation: "designation",
    roleType: "role_type", department: "department", status: "status"
  };

  for (const [field, value] of Object.entries(input)) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${columnMap[field]} = $${params.length}`);
  }

  if (sets.length === 0) return;
  params.push(id);
  await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function updatePasswordHash(id: string, passwordHash: string): Promise<void> {
  await pool.query(`UPDATE users SET password_hash = $1, must_reset_password = true WHERE id = $2`, [passwordHash, id]);
}

export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}
