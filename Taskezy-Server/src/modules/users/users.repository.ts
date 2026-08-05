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
  manager_id: string | null;
  manager_name: string | null;
}

// Read-only directory (no password_hash) — used by other modules to resolve
// a real user UUID (e.g. leads.assigned_agent_id) instead of guessing one.
export async function findAllActive(): Promise<UserDirectoryRow[]> {
  const { rows } = await query<UserDirectoryRow>(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.department, u.role_type, u.designation,
            u.manager_id, m.first_name || COALESCE(' ' || m.last_name, '') AS manager_name
     FROM users u
     LEFT JOIN users m ON m.id = u.manager_id
     WHERE u.status = 'ACTIVE' ORDER BY u.first_name, u.last_name`
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
  SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.role, u.department, u.role_type,
         u.employment_type, u.designation, u.status, u.created_at, u.manager_id,
         m.first_name || COALESCE(' ' || m.last_name, '') AS manager_name
  FROM users u
  LEFT JOIN users m ON m.id = u.manager_id
`;

export async function findById(id: string): Promise<FullUserRow | undefined> {
  const { rows } = await query<FullUserRow>(`${FULL_SELECT} WHERE u.id = $1`, [id]);
  return rows[0];
}

/** True if `id` refers to an ACTIVE user with role_type MANAGER — the only valid managerId target. */
export async function isActiveManager(id: string): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT true AS ok FROM users WHERE id = $1 AND status = 'ACTIVE' AND role_type = 'MANAGER'`,
    [id]
  );
  return rows.length > 0;
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
  managerId?: string;
  passwordHash: string; // already hashed by users.service.ts — never plaintext here
}

export async function create(input: CreateUserInput): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO users (first_name, last_name, email, company_email, phone_number, designation, role, role_type, employment_type, department, manager_id, password_hash)
     VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      input.firstName, input.lastName ?? null, input.email, input.phoneNumber ?? null, input.designation ?? null,
      input.role, input.roleType ?? null, input.employmentType ?? null, input.department ?? null,
      input.managerId ?? null, input.passwordHash
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
  managerId?: string | null;
}

export async function update(id: string, input: EditUserInput): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const columnMap: Record<string, string> = {
    firstName: "first_name", lastName: "last_name", designation: "designation",
    roleType: "role_type", department: "department", status: "status", managerId: "manager_id"
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
