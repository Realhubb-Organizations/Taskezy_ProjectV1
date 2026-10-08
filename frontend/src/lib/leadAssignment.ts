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

// Same signal as Data Calling: status "Unassigned" (ingest fallback), or no
// real agent name on the lead.
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
  return l.status === "Unassigned" || !l.assignedAgent || l.assignedAgent === "Not Assigned";
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
