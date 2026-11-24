// Working hours, every day of the week, in IST. Mirrors the server's
// Taskezy-Server/src/config/workingHours.ts — change both together. No
// screen changes them.
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 21;

export const WORKING_HOURS_LABEL = "9:00 AM – 9:00 PM";

// IST is a fixed +5:30 (no daylight saving).
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 3_600_000;
const HOUR_MS = 3_600_000;

/**
 * When a new lead's 20-minute first-response clock starts, given when it was
 * assigned (ms): that moment inside working hours, otherwise the next 9:00 AM
 * IST (9:30 PM -> 9:00 AM next day, 6:00 AM -> 9:00 AM same day).
 */
export function slaStartTime(assignedMs: number): number {
  const ist = assignedMs + IST_OFFSET_MS;
  const istMidnight = Math.floor(ist / DAY_MS) * DAY_MS;
  const hour = (ist - istMidnight) / HOUR_MS;
  if (hour < WORK_START_HOUR) return istMidnight + WORK_START_HOUR * HOUR_MS - IST_OFFSET_MS;
  if (hour >= WORK_END_HOUR) return istMidnight + DAY_MS + WORK_START_HOUR * HOUR_MS - IST_OFFSET_MS;
  return assignedMs;
}

/** A call time picked on screen ("HH:MM", the user's IST clock) is outside working hours. */
export function isOutsideWorkingHours(time: string): boolean {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < WORK_START_HOUR * 60 || minutes >= WORK_END_HOUR * 60;
}
