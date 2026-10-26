import type { Lead, Property, User } from "@/context/AppContext";

// Rules for the Leads page's bulk Assign / Reshuffle, kept in one place so
// the picker never offers someone the backend would reject
// (leads.service.ts → assertReassignAllowed / reassignLead):
//   - ADMIN may assign to anyone; a Manager only to their own direct reports.
//   - A lead can't be reassigned to the agent who already holds it.
//   - Additionally (product rule): the person doing the reassigning is never
//     offered as the assignee — they can't hand a lead to themselves.

interface AssignableUser {
  id: string;
  name: string;
  role: string;
  managerId?: string;
}

/**
 * Who can hold a lead: active CRM sales agents and managers. Never Finance,
 * Admin or other departments — same rule the server enforces on reassign.
 */
export function isLeadAssignableUser(u: { role: string; status?: string; department?: string }): boolean {
  return u.role === "AGENT" && u.status !== "INACTIVE" && (!u.department || u.department === "SALES");
}

/** Mirrors the server rule: the lead's owner, the owner's manager, or an admin may change its status. */
export function canChangeLeadStatus(lead: Lead, currentUser: User | null, users: User[]): boolean {
  if (!currentUser) return false;
  if (currentUser.role === "ADMIN") return true;
  const ownerId = lead.assignedAgentId ?? users.find(u => u.name === lead.assignedAgent)?.id;
  if (!ownerId) return false;
  if (ownerId === currentUser.id) return true;
  return users.find(u => u.id === ownerId)?.managerId === currentUser.id;
}

export const STATUS_LOCKED_HINT = "Only the lead's owner, their manager or an admin can change its status";

export function isUnassignedLead(l: Lead): boolean {
  return !!l.isUnassignedInSystem || !l.assignedAgent || l.assignedAgent === "Not Assigned";
}

/**
 * Agents who can receive `targetLeads`, for the selected properties:
 *   1. property scope — CUSTOM_MEMBERS properties limit it to their team;
 *      any ALL_MEMBERS property opens it to every agent (same as Data Calling);
 *   2. caller's reporting line — a Manager only sees their direct reports;
 *   3. never the caller themself;
 *   4. never someone who already holds every one of the target leads.
 */
export function eligibleAssignees<U extends AssignableUser>({
  users,
  properties,
  selectedPropertyIds,
  caller,
  targetLeads
}: {
  users: U[];
  properties: Property[];
  selectedPropertyIds: Set<string>;
  caller: { id: string; role: string; role_type?: string } | null;
  targetLeads: Lead[];
}): U[] {
  if (selectedPropertyIds.size === 0 || !caller) return [];

  const selectedProps = properties.filter(p => selectedPropertyIds.has(p.id));
  let anyAllMembers = false;
  const teamIds = new Set<string>();
  selectedProps.forEach(p => {
    if (p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0) {
      p.assignedTeam.forEach(m => teamIds.add(m.userId));
    } else {
      anyAllMembers = true;
    }
  });
  let pool = anyAllMembers ? users.filter(u => u.role === "AGENT") : users.filter(u => teamIds.has(u.id));

  if (caller.role !== "ADMIN") {
    pool = pool.filter(u => u.managerId === caller.id);
  }

  const currentHolders = new Set(targetLeads.map(l => l.assignedAgent?.trim().toLowerCase()));
  const allHeldBy = (name: string) => currentHolders.size === 1 && currentHolders.has(name.trim().toLowerCase());

  return pool.filter(u => u.id !== caller.id && !allHeldBy(u.name));
}

/** Uploading leads (manual entry or Data Calling bulk) — admins and sales managers only, never agents. Same rule as the server. */
export function canUploadLeads(user: { role: string; role_type?: string } | null): boolean {
  return !!user && (user.role === "ADMIN" || user.role_type === "Manager");
}

/**
 * Who an uploader may hand new leads to: an admin — every active sales user;
 * a manager — themselves and their own direct reports (the server rejects
 * anyone else).
 */
export function uploadAssignableUsers<U extends { id: string; role: string; status?: string; department?: string; managerId?: string }>(
  users: U[],
  uploader: { id: string; role: string } | null
): U[] {
  const sales = users.filter(u => u.role === "AGENT" && u.status !== "INACTIVE" && (!u.department || u.department === "SALES"));
  if (!uploader) return [];
  if (uploader.role === "ADMIN") return sales;
  return sales.filter(u => u.id === uploader.id || u.managerId === uploader.id);
}

/** Moving leads between people — admins and sales managers only, never agents. Same rule as the server. */
export const canReassignLeads = canUploadLeads;

/**
 * Can this user reassign THIS lead? Admins: any lead. Managers: only leads
 * owned by themselves or one of their direct reports (not another
 * manager's team). Agents: never. Mirrors leads.service.ts's reassignLead.
 */
export function canReassignThisLead(
  lead: { assignedAgent?: string } | null,
  user: { id: string; name: string; role: string; role_type?: string } | null,
  users: { id: string; name: string; managerId?: string }[]
): boolean {
  if (!lead || !user) return false;
  if (user.role === "ADMIN") return true;
  if (user.role_type !== "Manager") return false;
  if (lead.assignedAgent === user.name) return true;
  return users.find(u => u.name === lead.assignedAgent)?.managerId === user.id;
}

/** Deals items out one at a time across `buckets` (round-robin), so several assignees get an even share (sizes differ by at most 1). */
export function splitEvenly<T>(items: T[], buckets: number): T[][] {
  const out: T[][] = Array.from({ length: buckets }, () => []);
  items.forEach((item, i) => out[i % buckets].push(item));
  return out;
}
