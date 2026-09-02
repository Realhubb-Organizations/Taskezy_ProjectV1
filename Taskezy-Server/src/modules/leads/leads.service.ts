import { withTransaction } from "../../db/pool";
import { AccessTokenPayload } from "../../utils/tokens";
import { ApiError } from "../../utils/ApiError";
import * as repo from "./leads.repository";
import { CreateLeadInput } from "./leads.repository";
import * as usersRepo from "../users/users.repository";
import { createNotification } from "../notifications/notifications.service";
import { findPropertyIdBySheetSource } from "../properties/properties.repository";
import { pickAgentForProperty } from "../properties/properties.assignment";

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

export async function createLead(caller: AccessTokenPayload, input: CreateLeadInput) {
  // Mirrors addLead()'s duplicate-phone rule in AppContext.tsx — the leads.phone
  // UNIQUE constraint would also catch this, but checking first gives a clean
  // 409 with a useful message instead of a raw constraint-violation error.
  const existing = await repo.findByPhone(input.phone);
  if (existing) {
    throw ApiError.conflict(`A lead with phone number ${input.phone} already exists.`);
  }
  let created;
  try {
    created = await repo.create(input);
  } catch (err) {
    // assigned_agent_id references users(id) — a well-formed but nonexistent
    // UUID passes Zod's uuid() check and only fails at the DB as an FK violation.
    if (isForeignKeyViolation(err)) {
      throw ApiError.badRequest("Assigned agent not found.");
    }
    throw err;
  }

  // Meta leads get this via meta.lead-ingest.ts's own notification; every
  // other creation path (manual Add Lead, future Google Sheets ingestion,
  // any direct API caller) goes through here, so this is the one place that
  // needs to fire it for everything that isn't already covered.
  await createNotification({
    system: "CRM",
    category: "NEW_LEAD",
    title: "New Lead Assigned",
    message: `${created.name} — ${created.property_name || "Unassigned Project"} • via ${created.source || created.campaign || "Manual Entry"}`,
    recipientUserId: created.assigned_agent_id,
    leadId: created.id,
    link: "/dashboard/crm"
  });

  // Admin gets visibility into every lead creation too, not just the person
  // it lands on — matters most when one agent creates a lead and assigns it
  // to a teammate (Admin previously had no way to know that happened at
  // all). Excludes the assignee (already notified above) and the creator
  // themself (an admin creating a lead doesn't need to be told they just did).
  const adminIds = await usersRepo.listActiveAdminIds();
  const adminRecipients = adminIds.filter(id => id !== created.assigned_agent_id && id !== caller.sub);
  await Promise.all(
    adminRecipients.map(id => createNotification({
      system: "CRM",
      category: "NEW_LEAD",
      title: "New Lead Created",
      message: `${caller.name} added a new lead "${created.name}" and assigned it to ${created.assigned_agent_name}.`,
      recipientUserId: id,
      leadId: created.id,
      link: "/dashboard/crm"
    }))
  );

  return created;
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
      // The agent responded in time — this is what the follow-up SLA
      // scheduler (jobs/followupScheduler.ts) checks for before escalating
      // a missed reminder to admins, so it needs to land in the same
      // transaction as the status change itself.
      await client.query(
        `UPDATE followup_calls SET status = 'COMPLETED' WHERE lead_id = $1 AND status = 'UPCOMING'`,
        [leadId]
      );
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

/**
 * ADMIN may reassign a lead to anyone. Everyone else is restricted to their
 * own reporting line: a Manager may only hand a lead to one of their own
 * direct reports (or take it themselves); a Member may only hand it to a
 * teammate who shares their manager (or to that manager). Checked here, not
 * just in the UI, since the route is open to every authenticated role.
 */
async function assertReassignAllowed(caller: AccessTokenPayload, newAgentId: string): Promise<void> {
  if (caller.role === "ADMIN") return;

  if (caller.roleType === "MANAGER") {
    if (newAgentId === caller.sub) return;
    const target = await usersRepo.findById(newAgentId);
    if (target?.manager_id === caller.sub) return;
    throw ApiError.forbidden("You can only reassign leads to one of your own direct reports.");
  }

  // Member: peers under the same manager, or the manager themself.
  const callerUser = await usersRepo.findById(caller.sub);
  if (callerUser?.manager_id && newAgentId === callerUser.manager_id) return;
  const target = await usersRepo.findById(newAgentId);
  if (callerUser?.manager_id && target?.manager_id === callerUser.manager_id) return;
  throw ApiError.forbidden("You can only reassign leads to a teammate under your own manager.");
}

// Deletion is ADMIN-only — enforced by requireRole at the route level (see
// leads.routes.ts). Reassignment is open to every role but scoped by
// reporting line above, since a Member routing a missed lead to a teammate
// is a normal CRM action, not an admin-only one.
export async function reassignLead(caller: AccessTokenPayload, leadId: string, newAgentId: string) {
  const previousAgentId = await repo.getAssignedAgentId(leadId);
  if (!previousAgentId) throw ApiError.notFound("Lead not found");
  if (previousAgentId === newAgentId) {
    throw ApiError.badRequest("Lead is already assigned to this agent.");
  }
  await assertReassignAllowed(caller, newAgentId);

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

  const updated = await repo.findById(leadId);
  if (updated) {
    await createNotification({
      system: "CRM",
      category: "REASSIGNMENT",
      title: "Lead Reassigned To You",
      message: `${updated.name} — ${updated.property_name || "Unassigned Project"} was reassigned to you by ${caller.name}.`,
      recipientUserId: newAgentId,
      leadId: updated.id,
      link: "/dashboard/crm"
    });
  }
  return updated;
}

/**
 * One-time (but safe to re-run anytime) maintenance action: re-checks every
 * sheet-imported lead currently sitting UNASSIGNED — i.e. one that fell back
 * to an admin at ingest time because its sheet source wasn't linked to a
 * property yet (Property editor -> Connected Lead-Form Sheets), or was
 * linked to one with no configured sales team — and moves it to a real
 * agent via the exact same Round Robin / Percentage rule a fresh import
 * would use, now that the link/team has been set up. A lead whose sheet
 * source still doesn't resolve to an assignable team is left exactly as it
 * was; nothing here ever assigns anyone speculatively.
 */
export async function reassignUnassignedSheetLeads(caller: AccessTokenPayload): Promise<{ reassigned: number; stillUnassigned: number; total: number }> {
  const candidates = await repo.findUnassignedSheetLeads();
  let reassigned = 0;
  let stillUnassigned = 0;

  for (const lead of candidates) {
    let propertyId = lead.property_id ?? undefined;

    // No property matched at ingest time — recover the sheet's project name
    // from the lead's own first log entry and try the link again now that an
    // admin may have connected that sheet source to a property (Property
    // editor -> Connected Lead-Form Sheets).
    if (!propertyId) {
      const sourceSheetName = await repo.findImportedSourceSheetName(lead.id);
      if (sourceSheetName) {
        propertyId = await findPropertyIdBySheetSource(sourceSheetName);
        if (propertyId) {
          await repo.setLeadPropertyId(lead.id, propertyId);
        }
      }
    }

    const newAgentId = propertyId ? await pickAgentForProperty(propertyId) : undefined;

    if (!newAgentId || newAgentId === lead.assigned_agent_id) {
      stillUnassigned++;
      continue;
    }

    await reassignLead(caller, lead.id, newAgentId);
    await repo.markLeadNewIfUnassigned(lead.id);
    reassigned++;
  }

  return { reassigned, stillUnassigned, total: candidates.length };
}

/**
 * One-time (safe to re-run) maintenance action: ingestSheetLead used to let
 * created_at default to now() at insert time, dating every sheet-imported
 * lead by when the sync happened to run rather than when the prospect
 * actually submitted the form. That's since been fixed for new imports —
 * this corrects every lead imported before the fix, recovering the sheet's
 * real Timestamp from the "Original sheet timestamp: ..." line each lead
 * already has in its own first import log entry. A lead whose created_at
 * already matches (new imports, or a lead this has already fixed) is left
 * untouched.
 */
export async function fixSheetLeadTimestamps(): Promise<{ fixed: number; alreadyCorrect: number; total: number }> {
  const leads = await repo.findAllSheetLeads();
  let fixed = 0;
  let alreadyCorrect = 0;

  for (const lead of leads) {
    const originalTimestamp = await repo.findImportedOriginalTimestamp(lead.id);
    if (!originalTimestamp) {
      alreadyCorrect++;
      continue;
    }
    const currentCreatedAt = new Date(lead.created_at);
    if (Math.abs(currentCreatedAt.getTime() - originalTimestamp.getTime()) < 1000) {
      alreadyCorrect++;
      continue;
    }
    await repo.setLeadCreatedAt(lead.id, originalTimestamp);
    fixed++;
  }

  return { fixed, alreadyCorrect, total: leads.length };
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
  const lead = await repo.findById(leadId);
  if (lead) {
    await createNotification({
      system: "CRM",
      category: "KYC",
      title: "KYC Verified",
      message: `${lead.name}'s KYC document has been verified — the invoice can now be generated.`,
      recipientUserId: lead.assigned_agent_id,
      leadId: lead.id,
      link: "/dashboard/crm"
    });
  }
  return lead;
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}
