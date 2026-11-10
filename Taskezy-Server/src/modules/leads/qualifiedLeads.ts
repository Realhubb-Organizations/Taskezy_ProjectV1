// The one "qualified lead" rule for every page (Leads, Campaigns, Team /
// Manager / Marketing Reports, ad-spend stats) — agreed 2026-11-10:
//   Qualified   = Followup, Site Visit Scheduled / Done, EOI, Booked,
//                 Low Budget, Other requirement, Different Location, and RNR
//                 only when the customer picked up at least once (a call
//                 from the app whose feedback was "Connected").
//   Unqualified = Dead Lead, Not Interested, and RNR never picked up.
// Everything else (New Lead, Call Back, Broker, Cancelled, ...) is neither.
// Data Calling has its own rule (Connected + Qualified sub-status).

/** Statuses that are always qualified (RNR is qualified only when picked up). */
export const QUALIFIED_STATUS_CODES = [
  "FOLLOWUP", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "EOI", "BOOKED",
  "LOW_BUDGET", "OTHER_REQUIREMENT", "DIFFERENT_LOCATION"
];

/** Statuses that are always unqualified (RNR is unqualified only when never picked up). */
export const UNQUALIFIED_STATUS_CODES = ["DEAD_LEAD", "NOT_INTERESTED"];

const PICKED_UP_SQL = (alias: string) =>
  `EXISTS (SELECT 1 FROM call_attempts qa WHERE qa.lead_id = ${alias}.id AND qa.channel = 'CALL' AND qa.outcome = 'Connected')`;

/** Lead `alias` is RNR and the customer picked up at least once. */
export const RNR_PICKED_UP_SQL = (alias: string) => `(${alias}.status_code = 'RNR' AND ${PICKED_UP_SQL(alias)})`;

/** Lead `alias` is RNR and the customer never picked up. */
export const RNR_NOT_PICKED_UP_SQL = (alias: string) => `(${alias}.status_code = 'RNR' AND NOT ${PICKED_UP_SQL(alias)})`;

const inList = (codes: string[]) => codes.map(c => `'${c}'`).join(", ");

/** Lead `alias` is qualified. */
export const QUALIFIED_LEAD_SQL = (alias: string) =>
  `(${alias}.status_code IN (${inList(QUALIFIED_STATUS_CODES)}) OR ${RNR_PICKED_UP_SQL(alias)})`;

/** Lead `alias` is unqualified. */
export const UNQUALIFIED_LEAD_SQL = (alias: string) =>
  `(${alias}.status_code IN (${inList(UNQUALIFIED_STATUS_CODES)}) OR ${RNR_NOT_PICKED_UP_SQL(alias)})`;
