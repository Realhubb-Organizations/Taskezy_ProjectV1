import * as repo from "./properties.repository";

/**
 * Picks which agent a new lead for this property should go to, mirroring
 * the property's configured Round Robin / Percentage rule (previously
 * captured in the UI but never actually executed anywhere — see
 * property_team_members). Returns undefined if the property has no
 * assignable pool (e.g. CUSTOM_MEMBERS with no members configured), in
 * which case the caller should fall back to its own default behavior.
 */
export async function pickAgentForProperty(propertyId: string): Promise<string | undefined> {
  const assignment = await repo.getAssignmentPool(propertyId);
  if (!assignment || assignment.pool.length === 0) return undefined;

  const { leadAssignmentMode, pool } = assignment;

  if (leadAssignmentMode === "PERCENTAGE" && pool.every(m => m.percentage !== null)) {
    return pickByPercentage(pool as { userId: string; percentage: number }[]);
  }

  // Round Robin (also the default for ALL_MEMBERS, which has no percentages
  // to weight by): the next person in the team's fixed order after whoever
  // got this property's last lead — one lead each, in turn.
  return repo.takeNextInRotation(propertyId, pool.map(m => m.userId));
}

/**
 * Same Round Robin/Percentage rule as pickAgentForProperty, but set up ONCE
 * and returned as a cheap in-memory picker to call per row — for bulk
 * uploads of thousands of leads against one property. Round Robin rotates
 * in memory from whoever got the property's last lead; call `save()` after
 * the batch so the next lead (from any source) carries on from there.
 * Returns undefined if the property has no assignable pool.
 */
export async function createPropertyAgentPicker(propertyId: string): Promise<{ next: () => string; save: () => Promise<void> } | undefined> {
  const assignment = await repo.getAssignmentPool(propertyId);
  if (!assignment || assignment.pool.length === 0) return undefined;

  const { leadAssignmentMode, pool } = assignment;

  if (leadAssignmentMode === "PERCENTAGE" && pool.every(m => m.percentage !== null)) {
    const weighted = pool as { userId: string; percentage: number }[];
    return { next: () => pickByPercentage(weighted), save: async () => {} };
  }

  const ids = pool.map(m => m.userId);
  let last = await repo.getLastInRotation(propertyId);
  let picked = false;
  return {
    next: () => {
      last = repo.nextInRotation(ids, last);
      picked = true;
      return last;
    },
    save: async () => {
      if (picked && last) await repo.setLastInRotation(propertyId, last);
    }
  };
}

function pickByPercentage(pool: { userId: string; percentage: number }[]): string {
  const total = pool.reduce((sum, m) => sum + m.percentage, 0);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)].userId;

  let roll = Math.random() * total;
  for (const member of pool) {
    roll -= member.percentage;
    if (roll <= 0) return member.userId;
  }
  return pool[pool.length - 1].userId; // floating-point fallback
}
