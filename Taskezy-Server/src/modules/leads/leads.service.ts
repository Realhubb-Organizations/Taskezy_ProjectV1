import { withTransaction } from "../../db/pool";
import { AccessTokenPayload } from "../../utils/tokens";
import { ApiError } from "../../utils/ApiError";
import * as repo from "./leads.repository";
import { CreateLeadInput } from "./leads.repository";

/**
 * Mirrors the frontend's isSalesMember scoping rule (AppContext.tsx /
 * LeadDashboard.tsx): a SALES department "Member" only ever sees their own
 * leads; Managers, Finance, and Admin see everything. This is the server-side
 * enforcement of that rule — the frontend's version was only ever a UI
 * filter, trivially bypassable by calling the API directly, which is exactly
 * why this needs to be re-checked here, not trusted from the client.
 */
function scopeForCaller(caller: AccessTokenPayload): string | undefined {
  const isSalesMember = caller.role === "AGENT" && caller.roleType === "MEMBER";
  return isSalesMember ? caller.sub : undefined;
}

export async function listLeads(caller: AccessTokenPayload, filter: {
  page: number;
  pageSize: number;
  status?: string;
  assignedAgentId?: string;
  search?: string;
}) {
  const scopedToAgentId = scopeForCaller(caller);
  const { rows, totalCount } = await repo.findMany({
    page: filter.page,
    pageSize: filter.pageSize,
    statusCode: filter.status,
    assignedAgentId: filter.assignedAgentId,
    search: filter.search,
    scopedToAgentId
  });
  return {
    rows,
    meta: {
      page: filter.page,
      pageSize: filter.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / filter.pageSize))
    }
  };
}

export async function getLead(caller: AccessTokenPayload, id: string) {
  const scopedToAgentId = scopeForCaller(caller);
  const lead = await repo.findById(id, scopedToAgentId);
  if (!lead) throw ApiError.notFound("Lead not found");
  return lead;
}

// caller is unused today (any authenticated user may create a lead for any
// agent, matching the frontend's Add Lead form) but kept in the signature
// for when creation gets restricted by role — see requireRole in routes.
export async function createLead(_caller: AccessTokenPayload, input: CreateLeadInput) {
  // Mirrors addLead()'s duplicate-phone rule in AppContext.tsx — the leads.phone
  // UNIQUE constraint would also catch this, but checking first gives a clean
  // 409 with a useful message instead of a raw constraint-violation error.
  const existing = await repo.findByPhone(input.phone);
  if (existing) {
    throw ApiError.conflict(`A lead with phone number ${input.phone} already exists.`);
  }
  try {
    return await repo.create(input);
  } catch (err) {
    // assigned_agent_id references users(id) — a well-formed but nonexistent
    // UUID passes Zod's uuid() check and only fails at the DB as an FK violation.
    if (isForeignKeyViolation(err)) {
      throw ApiError.badRequest("Assigned agent not found.");
    }
    throw err;
  }
}

export async function updateLeadStatus(
  caller: AccessTokenPayload,
  leadId: string,
  statusCode: string,
  dealValue: number | undefined
) {
  const scopedToAgentId = scopeForCaller(caller);
  const existing = await repo.findById(leadId, scopedToAgentId);
  if (!existing) throw ApiError.notFound("Lead not found");

  const stampFirstResponse = existing.status_code === "NEW"; // first-ever status change

  try {
    await withTransaction(async (client) => {
      await repo.updateStatus(client, leadId, statusCode, dealValue, stampFirstResponse);
      await repo.insertLeadLog(client, leadId, caller.sub, caller.name, `Status changed to "${statusCode}"`);
    });
  } catch (err) {
    // status_code references lead_statuses(code) — an unrecognized code
    // string passes Zod's min(1) check and only fails at the DB as an FK violation.
    if (isForeignKeyViolation(err)) {
      throw ApiError.badRequest(`"${statusCode}" is not a recognized lead status.`);
    }
    throw err;
  }

  return repo.findById(leadId, scopedToAgentId);
}

export async function editLead(caller: AccessTokenPayload, leadId: string, input: repo.EditLeadInput) {
  // Same ownership rule as read access: a sales member may only edit their
  // own leads; managers/finance/admin may edit any lead.
  const scopedToAgentId = scopeForCaller(caller);
  const existing = await repo.findById(leadId, scopedToAgentId);
  if (!existing) throw ApiError.notFound("Lead not found");

  await repo.update(leadId, input);
  return repo.findById(leadId);
}

// Reassignment and deletion are ADMIN-only — enforced by requireRole at the
// route level (see leads.routes.ts), not re-checked here, so there's exactly
// one place that decides who can call these.
export async function reassignLead(caller: AccessTokenPayload, leadId: string, newAgentId: string) {
  const previousAgentId = await repo.getAssignedAgentId(leadId);
  if (!previousAgentId) throw ApiError.notFound("Lead not found");
  if (previousAgentId === newAgentId) {
    throw ApiError.badRequest("Lead is already assigned to this agent.");
  }

  try {
    await withTransaction(async (client) => {
      await repo.reassign(client, leadId, previousAgentId, newAgentId);
      await repo.insertLeadLog(client, leadId, caller.sub, caller.name, "Reassigned to a different agent");
    });
  } catch (err) {
    // newAgentId references users(id) — a well-formed but nonexistent UUID
    // passes Zod's uuid() check and only fails at the DB as an FK violation.
    if (isForeignKeyViolation(err)) {
      throw ApiError.badRequest("New agent not found.");
    }
    throw err;
  }

  return repo.findById(leadId);
}

export async function deleteLead(leadId: string): Promise<void> {
  const existing = await repo.findById(leadId);
  if (!existing) throw ApiError.notFound("Lead not found");

  try {
    await repo.remove(leadId);
  } catch (err) {
    // invoices.lead_id is ON DELETE RESTRICT (see DATA_DICTIONARY.md) —
    // deliberately so a lead with billing history can't vanish silently.
    if (isForeignKeyViolation(err)) {
      throw ApiError.conflict("This lead has an associated invoice and cannot be deleted. Delete the invoice first.");
    }
    throw err;
  }
}

// KYC verification is ADMIN/FINANCE-only — enforced by requireRole at the
// route level (see leads.routes.ts), matching the frontend's verifyKYC action
// which only ever appears in the Finance module UI.
export async function verifyLeadKyc(leadId: string) {
  const updated = await repo.setKycVerified(leadId);
  if (!updated) throw ApiError.notFound("Lead not found");
  return repo.findById(leadId);
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}
