import { PoolClient } from "pg";
import { pool, query } from "../../db/pool";

export interface LeadListRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status_code: string;
  status_label: string;
  deal_value: string | null;
  lead_score: number | null;
  assigned_agent_id: string;
  assigned_agent_name: string;
  property_id: string | null;
  property_name: string | null;
  assigned_at: string | null;
  first_response_at: string | null;
  created_at: string;
  source: string | null;
  campaign: string | null;
  meta_page_name: string | null;
  meta_form_id: string | null;
  logs: { message: string; timestamp: string; user: string }[];
}

export interface LeadListFilter {
  page: number;
  pageSize: number;
  statusCode?: string;
  assignedAgentId?: string;
  search?: string;
  /** When set (non-admin/manager caller), results are hard-restricted to this agent's own leads. */
  scopedToAgentId?: string;
}

const LIST_SELECT = `
  SELECT
    l.id, l.name, l.phone, l.email, l.status_code, ls.label AS status_label,
    l.deal_value, l.lead_score, l.assigned_agent_id,
    u.first_name || COALESCE(' ' || u.last_name, '') AS assigned_agent_name,
    l.property_id, p.name AS property_name,
    l.assigned_at, l.first_response_at, l.created_at,
    l.source, l.campaign, l.meta_page_name, l.meta_form_id,
    COALESCE(
      (SELECT json_agg(json_build_object('message', ll.message, 'timestamp', ll.created_at, 'user', ll.user_name_snapshot) ORDER BY ll.created_at)
       FROM lead_logs ll
       WHERE ll.lead_id = l.id),
      '[]'
    ) AS logs
  FROM leads l
  JOIN users u ON u.id = l.assigned_agent_id
  JOIN lead_statuses ls ON ls.code = l.status_code
  LEFT JOIN properties p ON p.id = l.property_id
`;

export async function findMany(filter: LeadListFilter): Promise<{ rows: LeadListRow[]; totalCount: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.scopedToAgentId) {
    params.push(filter.scopedToAgentId);
    conditions.push(`l.assigned_agent_id = $${params.length}`);
  } else if (filter.assignedAgentId) {
    params.push(filter.assignedAgentId);
    conditions.push(`l.assigned_agent_id = $${params.length}`);
  }

  if (filter.statusCode) {
    params.push(filter.statusCode);
    conditions.push(`l.status_code = $${params.length}`);
  }

  if (filter.search) {
    params.push(`%${filter.search}%`);
    conditions.push(`(l.name ILIKE $${params.length} OR l.phone ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await query<{ count: string }>(
    `SELECT count(*) FROM leads l ${whereClause}`,
    params
  );

  const offset = (filter.page - 1) * filter.pageSize;
  params.push(filter.pageSize, offset);
  const dataResult = await query<LeadListRow>(
    `${LIST_SELECT} ${whereClause} ORDER BY l.assigned_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: dataResult.rows, totalCount: Number(countResult.rows[0]?.count ?? 0) };
}

export async function findById(id: string, scopedToAgentId?: string): Promise<LeadListRow | undefined> {
  const params: unknown[] = [id];
  let whereExtra = "";
  if (scopedToAgentId) {
    params.push(scopedToAgentId);
    whereExtra = `AND l.assigned_agent_id = $2`;
  }
  const { rows } = await query<LeadListRow>(`${LIST_SELECT} WHERE l.id = $1 ${whereExtra}`, params);
  return rows[0];
}

export async function findByPhone(phone: string): Promise<{ id: string } | undefined> {
  const { rows } = await query<{ id: string }>(`SELECT id FROM leads WHERE phone = $1`, [phone]);
  return rows[0];
}

export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string;
  source?: string;
  campaign?: string;
  propertyId?: string;
  assignedAgentId: string;
}

export async function create(input: CreateLeadInput): Promise<LeadListRow> {
  const now = new Date();
  const { rows } = await pool.query(
    `INSERT INTO leads (name, phone, email, source, campaign, property_id, assigned_agent_id, status_code, assigned_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'NEW', $8)
     RETURNING id`,
    [input.name, input.phone, input.email ?? null, input.source ?? null, input.campaign ?? null, input.propertyId ?? null, input.assignedAgentId, now]
  );
  const created = await findById(rows[0].id);
  return created!;
}

/** Must run inside the same transaction as insertLeadLog (see leads.service.ts). */
export async function updateStatus(
  client: PoolClient,
  leadId: string,
  statusCode: string,
  dealValue: number | undefined,
  stampFirstResponse: boolean
): Promise<void> {
  await client.query(
    `UPDATE leads
     SET status_code = $1,
         deal_value = COALESCE($2, deal_value),
         first_response_at = CASE WHEN $3 AND first_response_at IS NULL THEN now() ELSE first_response_at END
     WHERE id = $4`,
    [statusCode, dealValue ?? null, stampFirstResponse, leadId]
  );
}

export async function insertLeadLog(client: PoolClient, leadId: string, userId: string, userName: string, message: string): Promise<void> {
  await client.query(
    `INSERT INTO lead_logs (lead_id, user_id, user_name_snapshot, message) VALUES ($1, $2, $3, $4)`,
    [leadId, userId, userName, message]
  );
}

export interface EditLeadInput {
  name?: string;
  email?: string;
  source?: string;
  campaign?: string;
  propertyId?: string | null;
  leadScore?: number;
}

// Only touches columns actually present in the input — COALESCE would wrongly
// keep the old value when someone deliberately clears a field to empty/null,
// so this builds the SET list dynamically instead.
export async function update(id: string, input: EditLeadInput): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) { params.push(input.name); sets.push(`name = $${params.length}`); }
  if (input.email !== undefined) { params.push(input.email || null); sets.push(`email = $${params.length}`); }
  if (input.source !== undefined) { params.push(input.source); sets.push(`source = $${params.length}`); }
  if (input.campaign !== undefined) { params.push(input.campaign); sets.push(`campaign = $${params.length}`); }
  if (input.propertyId !== undefined) { params.push(input.propertyId); sets.push(`property_id = $${params.length}`); }
  if (input.leadScore !== undefined) { params.push(input.leadScore); sets.push(`lead_score = $${params.length}`); }

  if (sets.length === 0) return;
  params.push(id);
  await pool.query(`UPDATE leads SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function getAssignedAgentId(id: string): Promise<string | undefined> {
  const { rows } = await query<{ assigned_agent_id: string }>(`SELECT assigned_agent_id FROM leads WHERE id = $1`, [id]);
  return rows[0]?.assigned_agent_id;
}

/** Must run inside the same transaction as insertLeadLog. Restarts the SLA clock, matching the frontend's reassignLead. */
export async function reassign(client: PoolClient, leadId: string, previousAgentId: string, newAgentId: string): Promise<void> {
  await client.query(
    `UPDATE leads
     SET previous_agent_id = $1, assigned_agent_id = $2, reassigned_at = now(), assigned_at = now(), first_response_at = NULL
     WHERE id = $3`,
    [previousAgentId, newAgentId, leadId]
  );
}

export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function setKycVerified(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`UPDATE leads SET kyc_verified = true WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
