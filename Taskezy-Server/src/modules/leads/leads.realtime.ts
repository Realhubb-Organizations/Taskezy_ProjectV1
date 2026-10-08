import { publishToAll } from "../../utils/sseHub";

export function broadcastLeadChanged(leadId: string): void {
  publishToAll("leads-changed", { leadId });
}
