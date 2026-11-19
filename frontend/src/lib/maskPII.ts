// Display-only masking of a lead's phone/email for Manager and sales-agent
// sessions — Admin always sees the real value. This is deliberately
// DISPLAY-ONLY: never apply these to a `tel:`/`wa.me/`/`mailto:` href, a
// clipboard-copy call, or a CSV export field — those still need the real
// value to actually place a call / message / email, or they'd silently
// break a sales agent's ability to do their job. Only wrap the visible TEXT
// a user reads on screen. See project_crm_role_based_lead_scoping memory
// (2026-10-10 round — PII masking).
//
// Numbers are a normalized 10-digit Indian mobile or a "+<country code>"
// foreign number (see leads.repository.ts's normalizeLeadPhone), so a fixed
// first-2/last-2 mask reads consistently (keeping a foreign number's +);
// non-standard lengths still degrade safely.
// Accounts that see full phone numbers even though they aren't Admin.
// Email stays masked for them. Mirrors WEB_CALL_ALLOWED_EMAILS in callTrigger.ts.
const PHONE_UNMASKED_EMAILS = ["santosh@realhubb.in"];

// Set once per login by AppContext (setPhoneMaskingUser), so every
// maskPhone() call site honours the exception without each one knowing who
// is signed in.
let phoneUnmasked = false;

export function setPhoneMaskingUser(email: string | null | undefined): void {
  phoneUnmasked = !!email && PHONE_UNMASKED_EMAILS.includes(email.trim().toLowerCase());
}

export function maskPhone(phone: string): string {
  if (phoneUnmasked) return phone;
  const digits = phone.replace(/\D/g, "");
  const plus = phone.trim().startsWith("+") ? "+" : "";
  if (digits.length <= 4) return "•".repeat(digits.length || 4);
  return `${plus}${digits.slice(0, 2)}${"•".repeat(digits.length - 4)}${digits.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "••••";
  const user = email.slice(0, at);
  const domain = email.slice(at);
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${"•".repeat(Math.max(user.length - visible.length, 2))}${domain}`;
}
