import { publishToAll } from "../../utils/sseHub";
import { broadcastDataChanged } from "../../utils/dataChanged";

/** One lead changed — clients patch that lead in place, and every page showing lead data refreshes. */
export function broadcastLeadChanged(leadId: string): void {
  publishToAll("leads-changed", { leadId });
  broadcastDataChanged("leads", "tasks");
}

/** Many leads changed at once (bulk import) — clients reload their lead list once instead of per lead. */
export function broadcastManyLeadsChanged(): void {
  publishToAll("leads-changed", { bulk: true });
  broadcastDataChanged("leads", "tasks");
}
