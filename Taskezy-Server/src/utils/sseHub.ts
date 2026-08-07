import { Response } from "express";

// In-process pub/sub for Server-Sent Events — fine as long as the API runs
// as a single container (see Taskezy-Server/README "Scaling"). If this ever
// runs as more than one instance, a connected client only receives events
// published from the instance holding its stream, so this would need to
// move behind something shared (e.g. Redis pub/sub) at that point.
const clientsByUser = new Map<string, Set<Response>>();

/** Registers an open SSE response for a user; returns the cleanup function to call on disconnect. */
export function subscribe(userId: string, res: Response): () => void {
  let set = clientsByUser.get(userId);
  if (!set) {
    set = new Set();
    clientsByUser.set(userId, set);
  }
  set.add(res);
  return () => {
    set!.delete(res);
    if (set!.size === 0) clientsByUser.delete(userId);
  };
}

export function publishToUser(userId: string, event: string, data: unknown): void {
  const set = clientsByUser.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}
