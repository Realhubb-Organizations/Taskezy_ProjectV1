// Display-only masking of a lead's phone/email for Manager and sales-agent
// sessions — Admin always sees the real value. This is deliberately
// DISPLAY-ONLY: never apply these to a `tel:`/`wa.me/`/`mailto:` href, a
// clipboard-copy call, or a CSV export field — those still need the real
// value to actually place a call / message / email, or they'd silently
// break a sales agent's ability to do their job. Only wrap the visible TEXT
// a user reads on screen. See project_crm_role_based_lead_scoping memory
// (2026-10-10 round — PII masking).
//
// Every number in this app is a normalized 10-digit Indian mobile (see
// leads.repository.ts's normalizeIndianMobile), so a fixed first-2/last-2
// mask reads consistently; non-standard lengths still degrade safely.
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "•".repeat(digits.length || 4);
  return `${digits.slice(0, 2)}${"•".repeat(digits.length - 4)}${digits.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "••••";
  const user = email.slice(0, at);
  const domain = email.slice(at);
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${"•".repeat(Math.max(user.length - visible.length, 2))}${domain}`;
}
