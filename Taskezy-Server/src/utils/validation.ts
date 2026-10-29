import { z } from "zod";

// Field rules for what people type into the app's forms — the same rules the
// frontend shows inline (frontend/src/lib/validation.ts), enforced here so a
// bad value never gets in even if the form is bypassed.

/**
 * A 10-digit Indian mobile number, or undefined. Accepts spaces/dashes/
 * brackets, a +91 / 91 country code or a leading 0 — but never trims a
 * longer or mistyped number down into a different one. (External lead feeds
 * keep their own lenient normalizeIndianMobile in leads.repository.ts.)
 */
export function normalizeTypedIndianMobile(raw: string): string | undefined {
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(compact)) return undefined;
  let digits = compact.replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : undefined;
}

/**
 * A foreign number typed with its country code — "+971 55 422 3805" or
 * "00971554223805" — as "+" and 8–15 digits, or undefined. A + / 00 prefix is
 * required: without it a long number can't be told apart from a mistyped
 * Indian one. +91 is never foreign (Indian numbers stay 10 bare digits).
 */
export function normalizeForeignPhone(raw: string): string | undefined {
  const m = raw.trim().replace(/[\s\-().]/g, "").match(/^(?:\+|00)([1-9]\d{7,14})$/);
  return m && !m[1].startsWith("91") ? `+${m[1]}` : undefined;
}

/** A lead's phone: an Indian mobile (10 bare digits) or a foreign number (+country code). */
export function normalizeTypedLeadPhone(raw: string): string | undefined {
  return normalizeTypedIndianMobile(raw) ?? normalizeForeignPhone(raw);
}

const MOBILE_MESSAGE = "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.";
export const LEAD_PHONE_MESSAGE =
  "Enter a valid 10-digit mobile number, or a foreign number starting with + and its country code.";

/** Required mobile number, stored as 10 bare digits. */
export const indianMobile = z.string().transform((v, ctx) => {
  const n = normalizeTypedIndianMobile(v);
  if (!n) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: MOBILE_MESSAGE });
    return z.NEVER;
  }
  return n;
});

/** Required lead phone — Indian mobile or foreign number, see normalizeTypedLeadPhone. */
export const leadPhone = z.string().transform((v, ctx) => {
  const n = normalizeTypedLeadPhone(v);
  if (!n) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: LEAD_PHONE_MESSAGE });
    return z.NEVER;
  }
  return n;
});

/** Optional mobile number: "" or missing clears it, anything else must be valid. */
export const optionalIndianMobile = z.string().optional().transform((v, ctx) => {
  if (v === undefined) return undefined;
  if (v.trim() === "") return "";
  const n = normalizeTypedIndianMobile(v);
  if (!n) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: MOBILE_MESSAGE });
    return z.NEVER;
  }
  return n;
});

/** A person's name: letters (any language), spaces and . ' - only. */
export const personName = (max = 100, min = 2) =>
  z.string().trim().min(min, `Name must be at least ${min} character${min === 1 ? "" : "s"}`).max(max)
    .regex(/^[\p{L}][\p{L}\p{M} .'-]*$/u, "Name can only contain letters, spaces, dots, apostrophes and hyphens");
