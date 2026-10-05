import { query } from "../../db/pool";

export interface TimesheetListRow {
  id: string;
  user_id: string;
  user_name: string;
  work_date: string;
  punch_in: string;
  punch_out: string | null;
  punch_in_lat: string | null;
  punch_in_lng: string | null;
  duration_hours: string | null;
  status: string;
  regularization_id: string | null;
  requested_in: string | null;
  requested_out: string | null;
  reason: string | null;
  submitted_at: string | null;
}

// Same SELECT timesheets.routes.ts always used — kept here so the list
// endpoint's pagination (findMany) and the various single-row refetches
// after punch-in/out/regularize actions (still inline in timesheets.routes.ts)
// read from one definition.
export const TIMESHEET_SELECT = `
  SELECT t.id, t.user_id, u.first_name || COALESCE(' ' || u.last_name, '') AS user_name,
         t.work_date, t.punch_in, t.punch_out, t.punch_in_lat, t.punch_in_lng,
         t.duration_hours, t.status,
         r.id AS regularization_id, r.requested_in, r.requested_out, r.reason, r.submitted_at
  FROM timesheet_logs t
  JOIN users u ON u.id = t.user_id
  LEFT JOIN timesheet_regularization_requests r ON r.timesheet_id = t.id AND r.decision = 'PENDING'
`;

export interface TimesheetListFilter {
  page: number;
  pageSize: number;
  /**
   * Hard-restricts the result to one employee's rows. The route always sets
   * this to the caller's own id for a non-manager (real security scoping,
   * not optional), and optionally to an ADMIN/FINANCE-requested userId for
   * a manager's single-employee drill-down. Undefined for a manager's
   * "everyone" view.
   */
  scopedToUserId?: string;
}

/**
 * Real LIMIT/OFFSET pagination over timesheet_logs, replacing the old
 * `${SELECT} ORDER BY t.work_date DESC` that returned an employee's (or, for
 * ADMIN/FINANCE, every employee's) entire punch history — including
 * punch_in_lat/punch_in_lng — in one unbounded query.
 */
export async function findMany(filter: TimesheetListFilter): Promise<{ rows: TimesheetListRow[]; totalCount: number }> {
  const whereClause = filter.scopedToUserId ? "WHERE t.user_id = $1" : "";
  const params: unknown[] = filter.scopedToUserId ? [filter.scopedToUserId] : [];

  const countResult = await query<{ count: string }>(
    `SELECT count(*) FROM timesheet_logs t ${whereClause}`,
    params
  );

  const offset = (filter.page - 1) * filter.pageSize;
  params.push(filter.pageSize, offset);
  const dataResult = await query<TimesheetListRow>(
    `${TIMESHEET_SELECT} ${whereClause} ORDER BY t.work_date DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: dataResult.rows, totalCount: Number(countResult.rows[0]?.count ?? 0) };
}
