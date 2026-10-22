import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { AccessTokenPayload } from "../../utils/tokens";
import { hashPassword } from "../../utils/password";
import { createUserSchema, deleteUserSchema, editUserSchema, listUsersQuerySchema, resetPasswordSchema, userIdParamSchema, updateOwnEodReportTimeSchema } from "./users.schema";
import * as repo from "./users.repository";
import { pool, withTransaction } from "../../db/pool";
import * as leadsRepo from "../leads/leads.repository";
import * as leadsService from "../leads/leads.service";
import { broadcastLeadChanged } from "../leads/leads.realtime";
import { createNotification } from "../notifications/notifications.service";

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
    const { page, pageSize, search, group } = req.query as unknown as { page?: number; pageSize?: number; search?: string; group?: repo.UserListFilter["group"] };

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
    const { rows, totalCount } = await repo.findManyActive({ page: effectivePage, pageSize: effectivePageSize, search, group });
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

usersRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  validate({ params: userIdParamSchema, body: editUserSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("User not found");

    // Don't allow demoting/deactivating the last active admin — would lock
    // the tenant out of its own admin console with no way back in.
    if (existing.role === "ADMIN" && req.body.status === "INACTIVE") {
      const remainingAdmins = await repo.countAdmins(existing.id);
      if (remainingAdmins === 0) {
        throw ApiError.badRequest("Cannot deactivate the last active administrator account.");
      }
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
    const passwordHash = await hashPassword(req.body.newPassword);
    await repo.updatePasswordHash(req.params.id, passwordHash);
    sendOk(res, { passwordReset: true });
  })
);

// How much a delete would hand over, so the admin's delete dialog knows
// whether to ask who should get the user's leads.
usersRouter.get(
  "/:id/delete-impact",
  requireRole("ADMIN"),
  validate({ params: userIdParamSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("User not found");
    sendOk(res, {
      leadCount: await leadsRepo.countLeadsForAgent(req.params.id),
      // Team members whose "Reports to" will be cleared (admin re-assigns it after).
      reportNames: await repo.findDirectReportNames(req.params.id)
    });
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
    sendOk(res, rows);
  })
);

usersRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  validate({ params: userIdParamSchema, body: deleteUserSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("User not found");

    if (req.params.id === req.user!.sub) {
      throw ApiError.badRequest("You cannot delete your own account.");
    }
    if (existing.role === "ADMIN") {
      const remainingAdmins = await repo.countAdmins(existing.id);
      if (remainingAdmins === 0) {
        throw ApiError.badRequest("Cannot delete the last active administrator account.");
      }
    }

    const { reassignTo, note } = req.body as { reassignTo?: string[]; note?: string };
    const fromUser = { id: existing.id, name: `${existing.first_name}${existing.last_name ? " " + existing.last_name : ""}` };

    // One transaction: the user's leads (and their follow-ups) are handed
    // over and the user is deleted together, or nothing changes at all.
    let received = new Map<string, number>();
    let movedLeadIds: string[] = [];
    let clearedReports = 0;
    try {
      await withTransaction(async (client) => {
        const leadIds = await leadsRepo.lockLeadIdsForAgent(client, existing.id);
        if (leadIds.length > 0) {
          if (!reassignTo?.length || !note) {
            throw ApiError.conflict(`${fromUser.name} has ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}. Choose who should get them before deleting.`);
          }
          const ids = Array.from(new Set(reassignTo));
          if (ids.includes(existing.id)) throw ApiError.badRequest("Leads can't be reassigned to the user being deleted.");
          const found = await repo.findActiveSalesUsersByIds(client, ids);
          if (found.length !== ids.length) throw ApiError.badRequest("Leads can only go to active sales agents or managers.");
          // Keep the admin's order so the round-robin is predictable.
          const targets = ids.map(id => found.find(u => u.id === id)!);
          received = await leadsService.handOverLeadsInTransaction(client, req.user!, fromUser, leadIds, targets, note);
          movedLeadIds = leadIds;
        }
        const leftover = await leadsRepo.moveFollowupsToLeadOwners(client, existing.id);
        if (leftover > 0) {
          throw ApiError.conflict(`${fromUser.name} still has ${leftover} follow-up${leftover === 1 ? "" : "s"} not linked to a lead and cannot be deleted.`);
        }
        // Their team members' "Reports to" is cleared; the admin sets a new
        // manager for them from Manage Users afterwards.
        clearedReports = await repo.clearReportsTo(client, existing.id);
        // Leads keep this user's name as "Reassigned From" after they're gone.
        await leadsRepo.detachPreviousAgent(client, existing.id, fromUser.name);
        await repo.removeWithClient(client, existing.id);
      });
    } catch (err) {
      // invoices / reimbursement_claims reference users with ON DELETE
      // RESTRICT for audit/financial history — a real, expected failure mode.
      if (isForeignKeyViolation(err)) {
        throw ApiError.conflict("This user has invoices or claims linked to them and cannot be deleted. Reassign or remove those first.");
      }
      throw err;
    }

    for (const [userId, count] of received) {
      await createNotification({
        system: "CRM",
        category: "REASSIGNMENT",
        title: "Leads Reassigned To You",
        message: `${count} lead${count === 1 ? "" : "s"} from ${fromUser.name} ${count === 1 ? "was" : "were"} reassigned to you by ${req.user!.name}.`,
        recipientUserId: userId,
        link: "/dashboard/crm"
      });
    }
    movedLeadIds.forEach(broadcastLeadChanged);
    sendOk(res, { deleted: true, reassignedLeads: movedLeadIds.length, clearedReports });
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

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}
