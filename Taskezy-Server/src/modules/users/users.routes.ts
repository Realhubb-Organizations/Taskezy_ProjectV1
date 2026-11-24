import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { AccessTokenPayload } from "../../utils/tokens";
import { hashPassword } from "../../utils/password";
import { createUserSchema, editUserSchema, listUsersQuerySchema, resetPasswordSchema, userIdParamSchema, updateOwnEodReportTimeSchema } from "./users.schema";
import * as repo from "./users.repository";
import { pool } from "../../db/pool";
import { SUPER_ADMIN_EMAIL } from "../../config/superAdmin";
import { getPresence, getDevicePresence } from "../../utils/presence";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Same three-way split as leads.service.ts's scopeForCaller — duplicated
// rather than imported (see call-log's, followups', invoices', attendance's
// and properties' own copies of this same pattern for precedent), but this
// one answers a different question than those: it's not which ROWS to
// return (every active user's id/name/role/department genuinely is needed
// company-wide — HRMS's headcount/attendance-rate tiles on /dashboard/hrms
// are open to every department per layout.tsx's checkUserAccess and read
// users.length across the whole roster, and name-resolution dropdowns
// routinely need to resolve someone outside the caller's own team, e.g. an
// unassigned lead's fallback admin), it's which rows the caller is allowed
// to see the manager_id/manager_name ("reports to") relationship for. A
// Member genuinely does need that field for people other than themself —
// LeadDetailDrawer's reassign-target picker and leadAssignment.ts's
// eligibleAssignees both filter the full roster by other users' manager_id
// to find the caller's own manager and teammates who share that manager —
// but there's no legitimate reason for a Member or Manager to see WHO
// MANAGES WHOM anywhere outside their own reporting line (a different
// department's org chart, say). Returns the ids whose manager_id/
// manager_name stay visible, or undefined for "no restriction" (Admin/
// Finance, the only roles with a real reason to browse the whole company's
// reporting chain — e.g. Settings "Manage Users").
async function reportingLineVisibleIds(caller: AccessTokenPayload): Promise<string[] | undefined> {
  if (caller.role !== "AGENT") return undefined;
  if (caller.roleType === "MANAGER") {
    const reportIds = await repo.findDirectReportIds(caller.sub);
    return [caller.sub, ...reportIds];
  }
  // Member: self, their own manager, and that manager's other direct
  // reports (their teammates) — the token carries no manager_id of its own,
  // so it's looked up fresh rather than trusted from an old JWT.
  const self = await repo.findById(caller.sub);
  if (!self?.manager_id) return [caller.sub];
  const teammateIds = await repo.findDirectReportIds(self.manager_id);
  return [caller.sub, self.manager_id, ...teammateIds];
}

/** Nulls manager_id/manager_name on rows outside the caller's visibility (no-op for Admin/Finance, where visibleIds is undefined). */
function maskReportingLine(users: repo.UserDirectoryRow[], visibleIds: string[] | undefined): repo.UserDirectoryRow[] {
  if (!visibleIds) return users;
  return users.map(u => (visibleIds.includes(u.id) ? u : { ...u, manager_id: null, manager_name: null }));
}

usersRouter.get(
  "/",
  validate({ query: listUsersQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search, group, status } = req.query as unknown as {
      page?: number; pageSize?: number; search?: string; group?: repo.UserListFilter["group"]; status?: repo.UserListFilter["status"];
    };

    // Bare `GET /users` (no page/pageSize) stays the original full-directory
    // fetch — every dropdown/name-resolution consumer across the app
    // (assign-to, reassign, team pickers) and AppContext's own bulk load
    // depend on getting back the complete active-user array, not one page of
    // it. Only a caller that explicitly asks for a page (the admin Settings
    // "Manage Users" table) gets the paginated shape. The reporting-chain
    // (manager_id/manager_name) fields are then masked per-row to the
    // caller's own scope above — everything else about the row (id/name/
    // role/department) stays, since those are needed company-wide.
    if (page === undefined && pageSize === undefined) {
      const [users, visibleIds] = await Promise.all([repo.findAllActive(), reportingLineVisibleIds(req.user!)]);
      sendOk(res, maskReportingLine(users, visibleIds));
      return;
    }

    // The paginated shape only ever backs the admin Settings "Manage Users"
    // table (frontend/src/app/(app)/dashboard/settings/page.tsx) — that
    // whole route is already gated to ADMIN client-side (layout.tsx's
    // checkUserAccess), so this is the server-side enforcement of the same
    // rule for a caller hitting the paginated query params directly.
    if (req.user!.role !== "ADMIN") throw ApiError.forbidden();

    const effectivePage = page ?? 1;
    const effectivePageSize = pageSize ?? 20;
    const { rows, totalCount } = await repo.findManyUsers({ page: effectivePage, pageSize: effectivePageSize, search, group, status });
    sendPaginated(res, rows, {
      page: effectivePage,
      pageSize: effectivePageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / effectivePageSize))
    });
  })
);

// User/account management is ADMIN-only for every write below — creating,
// editing, or deleting accounts, and resetting passwords, are all sensitive
// enough that only the global admin role should be able to do them.

usersRouter.post(
  "/",
  requireRole("ADMIN"),
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    if (req.body.managerId && !(await repo.isActiveManager(req.body.managerId))) {
      throw ApiError.badRequest("managerId must be an active user with roleType MANAGER.");
    }
    const passwordHash = await hashPassword(req.body.password);
    try {
      const id = await repo.create({ ...req.body, passwordHash });
      sendOk(res, await repo.findById(id), 201);
    } catch (err) {
      if (repo.isUniqueViolation(err)) {
        throw ApiError.conflict(`A user with email ${req.body.email} already exists.`);
      }
      throw err;
    }
  })
);

/**
 * Only the Super Admin may edit, reset the password of, deactivate or
 * delete ANOTHER admin account. Every route that acts on a user account
 * calls this — it used to be checked on DELETE alone, which left the same
 * outcome reachable through the other three: any admin could reset the
 * Super Admin's password (account takeover), or move the Super Admin's
 * email off SUPER_ADMIN_EMAIL and then onto their own (Super Admin status
 * is decided by email). Your own account and non-admin accounts are
 * unaffected.
 */
async function assertSuperAdminForAdminTarget(
  callerId: string,
  target: { id: string; role: string },
  action: string
): Promise<void> {
  if (target.role !== "ADMIN" || target.id === callerId) return;
  const caller = await repo.findById(callerId);
  if (caller?.email !== SUPER_ADMIN_EMAIL) {
    throw ApiError.forbidden(`Only the Super Admin can ${action} another admin account.`);
  }
}

usersRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  validate({ params: userIdParamSchema, body: editUserSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("User not found");
    await assertSuperAdminForAdminTarget(req.user!.sub, existing, "edit");

    // Access Control toggles are Super-Admin-only — every other admin can
    // still edit everything else about a user, just not these fields.
    if (req.body.canBulkUploadCrmLeads !== undefined || req.body.canBulkChangeLeadProperty !== undefined) {
      const caller = await repo.findById(req.user!.sub);
      if (caller?.email !== SUPER_ADMIN_EMAIL) {
        throw ApiError.forbidden("Only the Super Admin can change bulk-action access control.");
      }
    }

    // Inactive is one-way: an inactive user is never made active again.
    // Making someone inactive goes through POST /:id/deactivate (its own
    // checks: not yourself, not the last admin).
    if (req.body.status !== undefined && req.body.status !== existing.status) {
      throw ApiError.badRequest(
        existing.status === "INACTIVE"
          ? "An inactive user can't be made active again."
          : "Use Make Inactive to change this user's status."
      );
    }

    if (req.body.managerId === req.params.id) {
      throw ApiError.badRequest("A user cannot report to themselves.");
    }
    if (req.body.managerId && !(await repo.isActiveManager(req.body.managerId))) {
      throw ApiError.badRequest("managerId must be an active user with roleType MANAGER.");
    }

    try {
      await repo.update(req.params.id, req.body);
    } catch (err) {
      if (repo.isUniqueViolation(err)) {
        throw ApiError.conflict(`A user with email ${req.body.email} already exists.`);
      }
      throw err;
    }
    sendOk(res, await repo.findById(req.params.id));
  })
);

usersRouter.patch(
  "/:id/password",
  requireRole("ADMIN"),
  validate({ params: userIdParamSchema, body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("User not found");
    await assertSuperAdminForAdminTarget(req.user!.sub, existing, "reset the password of");
    const passwordHash = await hashPassword(req.body.newPassword);
    await repo.updatePasswordHash(req.params.id, passwordHash);
    sendOk(res, { passwordReset: true });
  })
);

// Admin-only — Settings > Manage Users' per-user registered-device list.
// Two real sources, merged: user_devices (native app, push-token
// registrations) and login_history (every web login, password or Google,
// regardless of whether "trust this device" was ever checked — grouped by
// device_label so repeated logins from the same browser collapse into one
// row with a real first-seen/last-active pair, same shape user_devices
// already has).
usersRouter.get(
  "/:id/devices",
  requireRole("ADMIN"),
  validate({ params: userIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query<{ device_name: string | null; platform: string; created_at: string; last_seen_at: string; source: "app" | "web" }>(
      `SELECT device_name, platform, created_at, last_seen_at, 'app' AS source
       FROM user_devices WHERE user_id = $1
       UNION ALL
       SELECT device_label AS device_name, 'web' AS platform, min(created_at) AS created_at, max(created_at) AS last_seen_at, 'web' AS source
       FROM login_history WHERE user_id = $1
       GROUP BY device_label
       ORDER BY last_seen_at DESC`,
      [req.params.id]
    );
    // Each row's own live dot, matched by device_name — web rows match a
    // User-Agent-derived label, native rows match the real captured device
    // name the client sends explicitly (both computed the same way the
    // heartbeat/SSE connection compute theirs — see presence.routes.ts and
    // notifications.routes.ts). Falls back to the user's overall status
    // only if this exact device has never sent a heartbeat (e.g. right
    // after it was registered, before its first live session).
    const overall = getPresence(req.params.id).status;
    const withPresence = rows.map((row) => ({
      ...row,
      live_status: getDevicePresence(req.params.id, row.device_name ?? "") ?? overall
    }));
    sendOk(res, withPresence);
  })
);

// Users are never deleted — an admin makes them Inactive instead, so every
// record that mentions them (leads, activity, calls, reports, missed-lead
// records) stays exactly as it was.
//
// Make a user inactive. It's one-way: an inactive user can't log in and can
// never be made active again. Nothing they hold moves — their leads, calls
// and history stay assigned to them as they were.
usersRouter.post(
  "/:id/deactivate",
  requireRole("ADMIN"),
  validate({ params: userIdParamSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("User not found");
    if (existing.status === "INACTIVE") throw ApiError.badRequest("This user is already inactive.");
    if (req.params.id === req.user!.sub) throw ApiError.badRequest("You cannot make your own account inactive.");
    await assertSuperAdminForAdminTarget(req.user!.sub, existing, "deactivate");
    if (existing.role === "ADMIN" && (await repo.countAdmins(existing.id)) === 0) {
      throw ApiError.badRequest("Cannot deactivate the last active administrator account.");
    }
    await pool.query(`UPDATE users SET status = 'INACTIVE' WHERE id = $1`, [existing.id]);
    sendOk(res, { deactivated: true });
  })
);

// Self-scoped only (always the caller's own row) — no role check needed,
// a Manager can only ever touch their own eod_report_time this way.
usersRouter.patch(
  "/me/eod-report-time",
  validate({ body: updateOwnEodReportTimeSchema }),
  asyncHandler(async (req, res) => {
    await repo.updateOwnEodReportTime(req.user!.sub, req.body.eodReportTime);
    sendOk(res, { updated: true });
  })
);
