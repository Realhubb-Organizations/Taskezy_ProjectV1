import { z } from "zod";

// Mirrors leads.schema.ts's listLeadsQuerySchema (page/pageSize pattern) —
// the HRMS attendance report table used to fetch attendance_view's entire
// result set (every employee's full present/late/on-time tally) in one
// unbounded query.
export const listAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // 25 matches the HRMS page's attendance table default rows-per-page (see
  // frontend/src/app/(app)/dashboard/hrms/page.tsx's TablePagination wiring).
  // 500 (same ceiling as leads.schema.ts) is a real safety cap, not an
  // invitation to fetch everything — AppContext's own bulk load
  // (apiListAttendance, kept for other consumers' simple derived counts)
  // pages through this endpoint at that size the same way apiListAllLeads
  // does for leads.
  pageSize: z.coerce.number().int().positive().max(500).default(25)
});
