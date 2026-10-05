import { z } from "zod";

// Mirrors leads.schema.ts's listLeadsQuerySchema (page/pageSize pattern) —
// the HRMS timesheets table used to fetch every punch record (including
// punch_in_lat/punch_in_lng GPS coordinates) for every employee's entire
// history in one unbounded query. That's both a performance problem and,
// because of the GPS columns, a real privacy exposure, so this is now a
// real, bounded page instead of "return everything".
export const listTimesheetsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // 25 matches the HRMS page's table default rows-per-page (see
  // frontend/src/app/(app)/dashboard/hrms/page.tsx's TablePagination wiring).
  // 500 (same ceiling as leads.schema.ts) is a real safety cap, not an
  // invitation to fetch everything — AppContext's own bulk load
  // (apiListTimesheets, kept for other consumers' simple derived counts)
  // pages through this endpoint at that size the same way apiListAllLeads
  // does for leads.
  pageSize: z.coerce.number().int().positive().max(500).default(25),
  // ADMIN/FINANCE-only drill-down to one employee's history. Silently
  // ignored for a non-manager caller — see timesheets.routes.ts, which
  // always hard-scopes a non-manager to their own rows regardless of what
  // userId they send, so this can never be used to read someone else's
  // punch history (including their GPS coordinates) by spoofing the param.
  userId: z.string().uuid().optional()
});
