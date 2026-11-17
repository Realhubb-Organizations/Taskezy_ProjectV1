import { logger } from "../utils/logger";
import { BUSINESS_TIMEZONE } from "../utils/businessDate";
import { listActiveAdminIds } from "../modules/users/users.repository";
import { summarizeWaitingLeads, sendWaitingLeadsReminder } from "../modules/notifications/waitingLeadsReminder";

/**
 * Morning half of the "N leads waiting to be assigned" admin reminder
 * (the end-of-day half is sent with the other admin EOD digests in
 * eodReportScheduler.ts). Checks every 5 minutes; between 10:00 and 13:00
 * business time it sends each active admin the reminder once that day, and
 * only when something is waiting. The window means a server started late in
 * the day doesn't send a "morning" reminder at night.
 */
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const WINDOW_START_HOUR = 10;
const WINDOW_END_HOUR = 13;

function businessHourNow(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIMEZONE, hour: "2-digit", hour12: false }).format(new Date()));
}

async function runOnce(): Promise<void> {
  const hour = businessHourNow();
  if (hour < WINDOW_START_HOUR || hour >= WINDOW_END_HOUR) return;
  const summary = await summarizeWaitingLeads();
  if (summary.total === 0) return;
  for (const adminId of await listActiveAdminIds()) {
    // Each admin is guarded separately (once per day), so one failure doesn't stop the rest.
    await sendWaitingLeadsReminder(adminId, "morning", summary).catch(err =>
      logger.error({ err, adminId }, "Morning waiting-leads reminder failed for an admin")
    );
  }
}

export function startWaitingLeadsMorningReminder(): void {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    runOnce()
      .catch(err => logger.error({ err }, "Morning waiting-leads reminder cycle failed"))
      .finally(() => { running = false; });
  }, POLL_INTERVAL_MS).unref();
  logger.info(`Waiting-leads morning reminder scheduled (${WINDOW_START_HOUR}:00 ${BUSINESS_TIMEZONE}, admins, Reminder Alerts)`);
}
