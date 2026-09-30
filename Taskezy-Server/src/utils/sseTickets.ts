import crypto from "crypto";

// One-time, very-short-lived tickets for opening the notifications SSE stream
// (see notifications.routes.ts). EventSource can't set an Authorization
// header, so the real access token used to travel as a `?access_token=`
// query param instead — which meant it sat in the URL for the lifetime of
// that (until-recently 15-minute) token, exposed to browser history, any
// proxy/CDN access log, and (until the httpLogger fix) this app's own logs.
// A ticket fixes that at the source rather than just hiding it from logs:
// it's a random value unrelated to the real access token, valid for a few
// seconds, and destroyed the instant it's used — so even a fully-logged
// ticket is worthless by the time anyone could act on it.
//
// In-memory only, matching sseHub.ts's existing single-instance assumption
// (see that file's comment on what moving to >1 instance would require).
const TICKET_TTL_MS = 45_000;
const tickets = new Map<string, { userId: string; expiresAt: number }>();

function sweepExpired(now: number): void {
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(ticket);
  }
}

export function issueTicket(userId: string): string {
  const now = Date.now();
  sweepExpired(now);
  const ticket = crypto.randomBytes(32).toString("base64url");
  tickets.set(ticket, { userId, expiresAt: now + TICKET_TTL_MS });
  return ticket;
}

/** Single-use: the ticket is deleted whether or not it turns out to be valid. */
export function consumeTicket(ticket: string): string | null {
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.userId;
}
