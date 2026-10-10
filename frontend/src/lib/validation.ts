// Form validation rules shared by every CRM form (leads, properties, users).
// Each validator returns an error message to show under the field, or null
// when the value is fine. The server enforces the same rules
// (Taskezy-Server/src/utils/validation.ts).

/**
 * A 10-digit Indian mobile number, or null. Accepts the common ways people
 * type one: spaces/dashes/brackets, a +91 / 91 country code or a leading 0.
 * Anything else (letters, 11 digits, landline-style numbers) is rejected
 * rather than trimmed into a different number.
 */
export function normalizeIndianMobile(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;
  let digits = compact.replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function validatePhone(raw: string, { required = false, label = "Phone number" } = {}): string | null {
  const value = raw.trim();
  if (!value) return required ? `${label} is required.` : null;
  if (/[a-z]/i.test(value)) return `${label} can only contain digits.`;
  if (!normalizeIndianMobile(value)) return `Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.`;
  return null;
}

/** Keeps only what a phone number can contain while typing (digits, +, spaces, dashes). */
export function sanitizePhoneInput(raw: string): string {
  return raw.replace(/[^\d+\s-]/g, "").slice(0, 16);
}

/** Props for a phone <input>: numeric keypad on phones, no letters, sensible length. */
export const phoneInputProps = {
  type: "tel",
  inputMode: "numeric" as const,
  autoComplete: "tel",
  maxLength: 16
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Unicode-aware (names in any script). Built with RegExp() because the
// project's TS target doesn't accept the /u flag in a literal.
const PERSON_NAME_RE = new RegExp("^[\\p{L}][\\p{L}\\p{M} .'-]*$", "u");
const HAS_LETTER_OR_DIGIT_RE = new RegExp("[\\p{L}\\d]", "u");

export function validateEmail(raw: string, { required = false, label = "Email" } = {}): string | null {
  const value = raw.trim();
  if (!value) return required ? `${label} is required.` : null;
  if (value.length > 254 || !EMAIL_RE.test(value)) return `Enter a valid email address, e.g. name@example.com.`;
  return null;
}

/** A person's name: letters (any language), spaces and . ' - only. */
export function validatePersonName(raw: string, { required = true, label = "Name", min = 2, max = 100 } = {}): string | null {
  const value = raw.trim();
  if (!value) return required ? `${label} is required.` : null;
  if (value.length < min) return `${label} must be at least ${min} characters.`;
  if (value.length > max) return `${label} must be at most ${max} characters.`;
  if (!PERSON_NAME_RE.test(value)) return `${label} can only contain letters, spaces, dots, apostrophes and hyphens.`;
  return null;
}

/** Free text such as a property, builder or location name: required/length only, must contain a letter or digit. */
export function validateText(raw: string, { required = true, label = "This field", min = 2, max = 200 } = {}): string | null {
  const value = raw.trim();
  if (!value) return required ? `${label} is required.` : null;
  if (value.length < min) return `${label} must be at least ${min} characters.`;
  if (value.length > max) return `${label} must be at most ${max} characters.`;
  if (!HAS_LETTER_OR_DIGIT_RE.test(value)) return `${label} must contain letters or numbers.`;
  return null;
}

export function validateUrl(raw: string, { required = false, label = "Link" } = {}): string | null {
  const value = raw.trim();
  if (!value) return required ? `${label} is required.` : null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname.includes(".")) throw new Error("bad");
    return value.length > 1000 ? `${label} is too long.` : null;
  } catch {
    return `Enter a full link starting with https://, e.g. https://maps.google.com/...`;
  }
}

export function validatePassword(raw: string, { label = "Password" } = {}): string | null {
  if (!raw) return `${label} is required.`;
  if (raw.length < 8) return `${label} must be at least 8 characters.`;
  if (raw.length > 128) return `${label} must be at most 128 characters.`;
  return null;
}

/**
 * A quoted price like "1.91 Cr", "85 Lakh", "85 L", "₹ 45,00,000" or "4500000".
 * Returns the value in rupees, or null when it isn't a price.
 */
export function parseIndianPrice(raw: string): number | null {
  // A trailing "+" is how a "starting from" price is shown ("₹1.25 Cr+").
  const match = /^\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(cr|crs|crore|crores|l|lac|lacs|lakh|lakhs|k)?\s*\+?\s*$/i.exec(raw);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = (match[2] || "").toLowerCase();
  // No unit and a small number ("1.5") has always meant crores in this app.
  const multiplier = unit.startsWith("c") ? 1e7 : unit.startsWith("l") ? 1e5 : unit === "k" ? 1e3 : amount < 1000 ? 1e7 : 1;
  return Math.round(amount * multiplier);
}

export function validatePrice(raw: string, { required = false, label = "Price" } = {}): string | null {
  const value = raw.trim();
  if (!value) return required ? `${label} is required.` : null;
  return parseIndianPrice(value) === null ? `Enter a price like 1.91 Cr, 85 Lakh or 4500000.` : null;
}

/** Drops the null entries, so `Object.keys(errors).length === 0` means the form is valid. */
export function collectErrors<K extends string>(checks: Record<K, string | null>): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  (Object.keys(checks) as K[]).forEach(k => { if (checks[k]) out[k] = checks[k]!; });
  return out;
}
