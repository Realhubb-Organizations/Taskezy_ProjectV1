import { env } from "../config/env";

// The server and database run in UTC, but a business day is the calendar day
// in BUSINESS_TIMEZONE (IST): between 00:00 and 05:30 IST the UTC date is
// still yesterday. Use these helpers wherever a calendar day is decided.

export const BUSINESS_TIMEZONE = env.BUSINESS_TIMEZONE;

// en-CA formats as YYYY-MM-DD.
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

/** The business-calendar date (YYYY-MM-DD) of an instant. */
export function toBusinessDate(instant: Date): string {
  return dateKeyFormatter.format(instant);
}

/** Today's business-calendar date (YYYY-MM-DD). */
export function businessToday(): string {
  return toBusinessDate(new Date());
}

/** The business-calendar date `days` days from today (negative for the past). */
export function businessDateOffset(days: number): string {
  const [y, m, d] = businessToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
