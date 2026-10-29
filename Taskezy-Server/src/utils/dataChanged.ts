import { RequestHandler } from "express";
import { publishToAll } from "./sseHub";

// "Something in this area changed" — every connected client gets one small
// `data-changed` SSE event ({ topics }) and quietly refetches whatever it's
// showing for those topics. No record data goes over the wire, so it's safe
// to send to everyone; each client's refetch is still scoped by its own role.
//
// Changes landing within COALESCE_MS of each other go out as ONE event, so a
// bulk import / bulk reassign of hundreds of leads is a single refresh on
// every screen, not hundreds.
export type DataTopic = "leads" | "followups" | "tasks" | "calllog" | "properties" | "users" | "calendar";

const COALESCE_MS = 1000;
const pending = new Set<DataTopic>();
let timer: NodeJS.Timeout | null = null;

export function broadcastDataChanged(...topics: DataTopic[]): void {
  for (const t of topics) pending.add(t);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const batch = [...pending];
    pending.clear();
    if (batch.length > 0) publishToAll("data-changed", { topics: batch });
  }, COALESCE_MS);
  timer.unref?.();
}

/**
 * Mounted in front of a router: any successful write (non-GET, status < 400)
 * through it announces the given topics, so no individual route can forget to.
 */
export function broadcastOnWrite(...topics: DataTopic[]): RequestHandler {
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      res.on("finish", () => {
        if (res.statusCode < 400) broadcastDataChanged(...topics);
      });
    }
    next();
  };
}
