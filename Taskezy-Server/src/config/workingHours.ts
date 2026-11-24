import { BUSINESS_TIMEZONE } from "../utils/businessDate";

// Working hours, every day of the week, in BUSINESS_TIMEZONE (IST). Set here
// only — no screen changes them. Mirrored for the screens in
// frontend/src/lib/workingHours.ts; change both together.
//
// A new lead that arrives outside these hours is still notified straight
// away, but its 20-minute first-response clock starts at the next opening
// (9:00 AM): 9:30 PM -> 9:00 AM next day, 6:00 AM -> 9:00 AM same day.
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 21;

const tz = BUSINESS_TIMEZONE.replace(/'/g, "''");

/**
 * SQL: when a new lead's 20-minute clock starts, given the moment it was
 * assigned (`ts`, timestamptz) — `ts` itself inside working hours, otherwise
 * the next WORK_START_HOUR.
 */
export const slaStartSql = (ts: string) => `(CASE
  WHEN (${ts} AT TIME ZONE '${tz}')::time < time '${String(WORK_START_HOUR).padStart(2, "0")}:00'
    THEN (date_trunc('day', ${ts} AT TIME ZONE '${tz}') + interval '${WORK_START_HOUR} hours') AT TIME ZONE '${tz}'
  WHEN (${ts} AT TIME ZONE '${tz}')::time >= time '${String(WORK_END_HOUR).padStart(2, "0")}:00'
    THEN (date_trunc('day', ${ts} AT TIME ZONE '${tz}') + interval '1 day ${WORK_START_HOUR} hours') AT TIME ZONE '${tz}'
  ELSE ${ts}
END)`;
