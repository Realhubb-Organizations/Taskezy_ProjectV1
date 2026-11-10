// The one "qualified lead" rule — worked out on the server (Taskezy-Server
// modules/leads/qualifiedLeads.ts), agreed 2026-11-10:
//   Qualified   = Followup, Site Visit Scheduled / Done, EOI, Booked, Low
//                 Budget, Other requirement, Different Location, and RNR only
//                 when the customer picked up at least once.
//   Unqualified = Dead Lead, Not Interested, and RNR never picked up.
// RNR depends on a picked-up call, so a drill-down can't be a plain status
// list: put one of these markers in a lead-list filter's `status` instead
// (apiClient turns it into the server's qualifiedOnly / unqualifiedOnly).
export const QUALIFIED_STATUS_FILTER = "@QUALIFIED";
export const UNQUALIFIED_STATUS_FILTER = "@UNQUALIFIED";
