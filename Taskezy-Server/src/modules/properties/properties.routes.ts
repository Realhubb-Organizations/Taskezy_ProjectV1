import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { AccessTokenPayload } from "../../utils/tokens";
import { refreshCampaignListsNow } from "../../jobs/campaignListSync";
import { listLeadsWaitingForProperty, assignLeadsWaitingForProperty, autoAssignLeadsWaitingForProperty } from "../leads/leads.service";
import { findDirectReportIds } from "../users/users.repository";
import { createPropertySchema, editPropertySchema, listPropertiesQuerySchema, propertyIdParamSchema } from "./properties.schema";
import * as repo from "./properties.repository";
import { query } from "../../db/pool";
import { createNotification } from "../notifications/notifications.service";
import { logger } from "../../utils/logger";

export const propertiesRouter = Router();

propertiesRouter.use(requireAuth);

// Same three-way split as leads.service.ts's scopeForCaller — duplicated
// rather than imported since that function isn't exported (see call-log's,
// followups', invoices' and attendance's own copies of this same pattern
// for precedent). Properties have no caller-owned agent_id of their own —
// scoped via each property's own assigned-team-member list instead: the
// Properties page's team label (page.tsx's teamLabelForProperty /
// myTeamMembersOnProperty) already narrows what a Manager/Member is SHOWN
// to this same self+reports / self-only rule, client-side only. This is
// the server-side enforcement of that rule, so neither a direct API call
// nor the page's "Download" button (which just serializes the row as-is)
// can read the full property team roster past what that role is meant to see.
async function scopedTeamAgentIdsForCaller(caller: AccessTokenPayload): Promise<string[] | undefined> {
  if (caller.role !== "AGENT") return undefined;
  if (caller.roleType === "MEMBER") return [caller.sub];
  if (caller.roleType === "MANAGER") {
    const reportIds = await findDirectReportIds(caller.sub);
    return [caller.sub, ...reportIds];
  }
  return undefined;
}

/** Narrows a property row's team_members to the caller's scope (no-op for Admin/Finance, where scopedToAgentIds is undefined). */
function scopeTeamMembers(property: repo.PropertyRow, scopedToAgentIds: string[] | undefined): repo.PropertyRow {
  if (!scopedToAgentIds) return property;
  return { ...property, team_members: property.team_members.filter(m => scopedToAgentIds.includes(m.userId)) };
}

// Registered before "/:id" — otherwise "meta-campaign-suggestions" would be
// captured as the :id param and rejected by propertyIdParamSchema's uuid check.
propertiesRouter.get(
  "/meta-campaign-suggestions",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => sendOk(res, await repo.listDistinctMetaCampaignNames()))
);

propertiesRouter.get(
  "/google-campaign-suggestions",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => sendOk(res, await repo.listDistinctGoogleCampaignNames()))
);

// The campaign pickers' Refresh button: pulls the latest Meta + Google
// campaign lists now instead of waiting for the 15-minute refresh
// (jobs/campaignListSync.ts). Names/status only; at most one run a minute.
propertiesRouter.post(
  "/campaigns/refresh",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => sendOk(res, await refreshCampaignListsNow()))
);

propertiesRouter.get(
  "/sheet-source-suggestions",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => sendOk(res, await repo.listUnlinkedSheetSourceNames()))
);

// Real server-side pagination, same shape as GET /leads — page/pageSize
// required (defaulted by listPropertiesQuerySchema), with search/propertyType
// filters matching the admin table's own search box and Property Type
// column filter. apiListProperties() (AppContext's full "fetch everything"
// bridge for dropdown-picker consumers elsewhere in the app) pages through
// this same endpoint rather than needing a separate unbounded query.
propertiesRouter.get(
  "/",
  validate({ query: listPropertiesQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search, propertyType, sortDir, kind } = req.query as unknown as {
      page: number; pageSize: number; search?: string; propertyType?: string[]; sortDir?: "asc" | "desc"; kind: repo.PropertyKind;
    };
    const scopedToAgentIds = await scopedTeamAgentIdsForCaller(req.user!);
    const { rows, totalCount } = await repo.findMany({ page, pageSize, search, propertyType, sortDir, kind });
    const scopedRows = rows.map(row => scopeTeamMembers(row, scopedToAgentIds));
    sendPaginated(res, scopedRows, { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) });
  })
);

propertiesRouter.get(
  "/:id",
  validate({ params: propertyIdParamSchema }),
  asyncHandler(async (req, res) => {
    const property = await repo.findById(req.params.id);
    if (!property) throw ApiError.notFound("Property not found");
    const scopedToAgentIds = await scopedTeamAgentIdsForCaller(req.user!);
    sendOk(res, scopeTeamMembers(property, scopedToAgentIds));
  })
);

// Writes are ADMIN-only, matching the frontend's existing admin-only edit gate.
propertiesRouter.post(
  "/",
  requireRole("ADMIN"),
  validate({ body: createPropertySchema }),
  asyncHandler(async (req, res) => {
    const id = await repo.create(req.body);
    sendOk(res, await repo.findById(id), 201);
  })
);

propertiesRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema, body: editPropertySchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
    await repo.update(req.params.id, req.body);
    sendOk(res, await repo.findById(req.params.id));
  })
);

propertiesRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema }),
  asyncHandler(async (req, res) => {
    const deleted = await repo.remove(req.params.id);
    if (!deleted) throw ApiError.notFound("Property not found");
    sendOk(res, { deleted: true });
  })
);

// Campaigns and sheets bring in ad leads — a Data Calling property (its
// leads come only from Data Calling uploads) has none. It does keep a team
// and round robin, used when a Data Calling upload assigns by property.
function assertLeadsProperty(property: repo.PropertyRow): void {
  if (property.kind === "DATA_CALLING") {
    throw ApiError.badRequest("Data Calling properties have no campaigns or sheets.");
  }
}

const setTeamMembersSchema = z.object({
  members: z.array(z.object({
    userId: z.string().uuid(),
    percentage: z.number().min(0).max(100).optional()
  })).max(100)
});

/**
 * Notifies anyone newly added to a property's team — them directly ("you
 * are assigned to <property>"), and their manager, if any ("<name> is
 * assigned to <property>"). Best-effort: a failed notification must never
 * fail the team-member save that triggered it, so every call site wraps
 * this in a .catch.
 */
async function notifyNewPropertyTeamMembers(propertyName: string, newMembers: { userId: string; name: string }[]): Promise<void> {
  if (newMembers.length === 0) return;
  const { rows: managers } = await query<{ id: string; manager_id: string | null }>(
    `SELECT id, manager_id FROM users WHERE id = ANY($1::uuid[])`,
    [newMembers.map(m => m.userId)]
  );
  const managerIdByUser = new Map(managers.map(m => [m.id, m.manager_id]));

  await Promise.all(newMembers.flatMap(member => {
    const sends = [
      createNotification({
        system: "CRM",
        category: "GENERAL",
        title: "Property Assigned",
        message: `You are assigned to ${propertyName} property.`,
        recipientUserId: member.userId,
        link: "/dashboard/properties"
      })
    ];
    const managerId = managerIdByUser.get(member.userId);
    if (managerId) {
      sends.push(createNotification({
        system: "CRM",
        category: "GENERAL",
        title: "Teammate Assigned to Property",
        message: `${member.name} is assigned to ${propertyName} property.`,
        recipientUserId: managerId,
        link: "/dashboard/properties"
      }));
    }
    return sends;
  }));
}

propertiesRouter.put(
  "/:id/team-members",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema, body: setTeamMembersSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
    const previousMemberIds = new Set(existing.team_members.map(m => m.userId));

    try {
      await repo.replaceTeamMembersForProperty(req.params.id, req.body.members);
    } catch (err) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503") {
        throw ApiError.badRequest("One of these users doesn't exist.");
      }
      throw err;
    }

    const updated = await repo.findById(req.params.id);
    const newMembers = (updated?.team_members ?? []).filter(m => !previousMemberIds.has(m.userId));
    if (newMembers.length > 0) {
      notifyNewPropertyTeamMembers(existing.name, newMembers).catch(err =>
        logger.error({ err, propertyId: req.params.id }, "Could not send property-assignment notifications")
      );
    }

    // A team just set up (or changed) can now take leads that were waiting
    // for this property's campaign / sheet links. Runs in the background;
    // each lead is claimed atomically, so it can't clash with the popup's own
    // post-save auto-assign.
    autoAssignLeadsWaitingForProperty(req.user!, req.params.id).catch(err =>
      logger.error({ err, propertyId: req.params.id }, "Auto-assigning waiting leads after a team change failed")
    );

    sendOk(res, updated);
  })
);

propertiesRouter.get(
  "/:id/meta-campaigns",
  validate({ params: propertyIdParamSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
    sendOk(res, await repo.listCampaignNamesForProperty(req.params.id));
  })
);

propertiesRouter.get(
  "/:id/google-campaigns",
  validate({ params: propertyIdParamSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
    sendOk(res, await repo.listGoogleCampaignNamesForProperty(req.params.id));
  })
);

const setMetaCampaignsSchema = z.object({
  campaignNames: z.array(z.string().trim().min(1)).max(50)
});

// Leads that landed on an admin before this property's Meta campaign /
// sheet tab was linked. GET only previews them; nothing moves until an admin
// confirms the exact ids with POST (leads.service.ts for the safeguards).
propertiesRouter.get(
  "/:id/waiting-leads",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema }),
  asyncHandler(async (req, res) => {
    if (!(await repo.findById(req.params.id))) throw ApiError.notFound("Property not found");
    sendOk(res, await listLeadsWaitingForProperty(req.params.id));
  })
);

const assignWaitingLeadsSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(500)
});

// Called once by the property popup right after it saves its campaign /
// sheet links: moves every lead that was waiting for those links to the
// property's team (last 30 days, same safeguards). One call per save, after
// all links are written, and each lead is claimed atomically, so parallel
// saves can't move a lead twice.
propertiesRouter.post(
  "/:id/waiting-leads/auto-assign",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema }),
  asyncHandler(async (req, res) => {
    if (!(await repo.findById(req.params.id))) throw ApiError.notFound("Property not found");
    sendOk(res, await autoAssignLeadsWaitingForProperty(req.user!, req.params.id));
  })
);

propertiesRouter.post(
  "/:id/waiting-leads/assign",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema, body: assignWaitingLeadsSchema }),
  asyncHandler(async (req, res) => {
    sendOk(res, await assignLeadsWaitingForProperty(req.user!, req.params.id, req.body.leadIds));
  })
);

propertiesRouter.put(
  "/:id/meta-campaigns",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema, body: setMetaCampaignsSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
    assertLeadsProperty(existing);
    try {
      await repo.replaceCampaignsForProperty(req.params.id, req.body.campaignNames);
    } catch (err) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        throw ApiError.conflict("One of these campaigns is already linked to a different property.");
      }
      throw err;
    }
    sendOk(res, await repo.listCampaignNamesForProperty(req.params.id));
  })
);

const setGoogleCampaignsSchema = z.object({
  campaignNames: z.array(z.string().trim().min(1)).max(50)
});

propertiesRouter.put(
  "/:id/google-campaigns",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema, body: setGoogleCampaignsSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
    assertLeadsProperty(existing);
    try {
      await repo.replaceGoogleCampaignsForProperty(req.params.id, req.body.campaignNames);
    } catch (err) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        throw ApiError.conflict("One of these campaigns is already linked to a different property.");
      }
      throw err;
    }
    sendOk(res, await repo.listGoogleCampaignNamesForProperty(req.params.id));
  })
);

propertiesRouter.get(
  "/:id/sheet-sources",
  validate({ params: propertyIdParamSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
    sendOk(res, await repo.listSheetSourceNamesForProperty(req.params.id));
  })
);

const setSheetSourcesSchema = z.object({
  sheetSourceNames: z.array(z.string().trim().min(1)).max(50)
});

propertiesRouter.put(
  "/:id/sheet-sources",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema, body: setSheetSourcesSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
    assertLeadsProperty(existing);
    try {
      await repo.replaceSheetSourcesForProperty(req.params.id, req.body.sheetSourceNames);
    } catch (err) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        throw ApiError.conflict("One of these sheet sources is already linked to a different property.");
      }
      throw err;
    }
    sendOk(res, await repo.listSheetSourceNamesForProperty(req.params.id));
  })
);
