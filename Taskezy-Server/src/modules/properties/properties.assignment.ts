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
  // to weight by): give the lead to whoever on the pool currently holds the
  // fewest leads for this specific property.
  const counts = await repo.countLeadsPerAgentForProperty(propertyId, pool.map(m => m.userId));
  return [...pool].sort((a, b) => (counts[a.userId] ?? 0) - (counts[b.userId] ?? 0))[0].userId;
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
