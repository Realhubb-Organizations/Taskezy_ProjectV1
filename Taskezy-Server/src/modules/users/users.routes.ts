import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { hashPassword } from "../../utils/password";
import { createUserSchema, editUserSchema, resetPasswordSchema, userIdParamSchema } from "./users.schema";
import * as repo from "./users.repository";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await repo.findAllActive();
    sendOk(res, users);
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

    await repo.update(req.params.id, req.body);
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

usersRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  validate({ params: userIdParamSchema }),
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

    try {
      await repo.remove(req.params.id);
      sendOk(res, { deleted: true });
    } catch (err) {
      // leads.assigned_agent_id / invoices / reimbursement_claims / followup_calls
      // all reference users with ON DELETE RESTRICT for the ones that matter for
      // audit/financial history — a real, expected failure mode, not a bug.
      if (isForeignKeyViolation(err)) {
        throw ApiError.conflict("This user has assigned leads, invoices, or claims and cannot be deleted. Reassign or remove those first.");
      }
      throw err;
    }
  })
);

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}
