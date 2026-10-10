import type { PoolClient } from "pg";
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

export interface UserListFilter {
  page: number;
  pageSize: number;
  /** ILIKE across first/last name, email, and phone — matches the Settings "Manage Users" search box. */
  search?: string;
  /** CRM Manage Users stat cards: admins, sales managers, or sales agents. */
  group?: "crm" | "admin" | "sales-managers" | "sales-agents";
}

// Paginated counterpart to findAllActive() for the admin Settings "Manage
// Users" table specifically — same ACTIVE-only scope and column set/order so
// a page of this looks identical to a slice of the old full array, just
// fetched one page at a time instead of loading every user to slice
// client-side.
export async function findManyActive(filter: UserListFilter): Promise<{ rows: UserDirectoryRow[]; totalCount: number }> {
  const conditions: string[] = [`u.status = 'ACTIVE'`];
  const params: unknown[] = [];

  if (filter.group === "crm") {
    conditions.push(`(u.role = 'ADMIN' OR (u.department = 'SALES' AND u.role <> 'FINANCE'))`);
  } else if (filter.group === "admin") {
    conditions.push(`u.role = 'ADMIN'`);
  } else if (filter.group === "sales-managers") {
    conditions.push(`u.department = 'SALES' AND u.role_type = 'MANAGER'`);
  } else if (filter.group === "sales-agents") {
    conditions.push(`u.department = 'SALES' AND u.role_type IS DISTINCT FROM 'MANAGER' AND u.role <> 'ADMIN'`);
  }

  if (filter.search) {
    params.push(`%${filter.search}%`);
    conditions.push(`(u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone_number ILIKE $${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await query<{ count: string }>(`SELECT count(*) FROM users u ${whereClause}`, params);
  const totalCount = Number(countResult.rows[0]?.count ?? 0);

  const offset = (filter.page - 1) * filter.pageSize;
  const dataParams = [...params, filter.pageSize, offset];
  const { rows } = await query<UserDirectoryRow>(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.department, u.role_type, u.designation,
            u.manager_id, m.first_name || COALESCE(' ' || m.last_name, '') AS manager_name
     FROM users u
     LEFT JOIN users m ON m.id = u.manager_id
     ${whereClause}
     ORDER BY u.first_name, u.last_name
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );
  return { rows, totalCount };
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

/** Every active admin — the follow-up SLA scheduler escalates a missed reminder to all of them. */
export async function listActiveAdminIds(): Promise<string[]> {
  const { rows } = await query<{ id: string }>(`SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`);
  return rows.map(r => r.id);
}

/** Admin + Finance — the audience for billing/claim events (invoice generated, claim submitted). */
export async function listActiveAdminAndFinanceIds(): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM users WHERE (role = 'ADMIN' OR role = 'FINANCE') AND status = 'ACTIVE'`
  );
  return rows.map(r => r.id);
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
  // Normalized to lowercase — login (auth.service.ts) matches case-insensitively,
  // but storing consistently also prevents "Neha@x.in" and "neha@x.in" ever
  // being accepted as two different accounts by the UNIQUE constraint.
  const email = input.email.trim().toLowerCase();
  const { rows } = await pool.query(
    `INSERT INTO users (first_name, last_name, email, company_email, phone_number, designation, role, role_type, employment_type, department, manager_id, password_hash)
     VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      input.firstName, input.lastName || null, email, input.phoneNumber || null, input.designation ?? null,
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

/**
 * Clears "Reports to" for everyone who reported to `managerId` (inside the
 * delete transaction), so deleting a manager never leaves members pointing
 * at a user who no longer exists. Returns how many were cleared.
 */
export async function clearReportsTo(client: PoolClient, managerId: string): Promise<number> {
  const { rowCount } = await client.query(`UPDATE users SET manager_id = NULL WHERE manager_id = $1`, [managerId]);
  return rowCount ?? 0;
}

/** Names of active users who report to `managerId`. */
export async function findDirectReportNames(managerId: string): Promise<string[]> {
  const { rows } = await query<{ name: string }>(
    `SELECT first_name || COALESCE(' ' || last_name, '') AS name FROM users WHERE manager_id = $1 AND status = 'ACTIVE' ORDER BY first_name`,
    [managerId]
  );
  return rows.map(r => r.name);
}

/** Deletes the user inside an open transaction (see the DELETE /users/:id handover). */
export async function removeWithClient(client: PoolClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(`DELETE FROM users WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

/** The given users that can receive leads: active CRM sales agents and managers. */
export async function findActiveSalesUsersByIds(client: PoolClient, ids: string[]): Promise<{ id: string; name: string }[]> {
  const { rows } = await client.query<{ id: string; name: string }>(
    `SELECT id, first_name || COALESCE(' ' || last_name, '') AS name
     FROM users
     WHERE id = ANY($1::uuid[]) AND role = 'AGENT' AND status = 'ACTIVE' AND (department IS NULL OR department = 'SALES')`,
    [ids]
  );
  return rows;
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}
