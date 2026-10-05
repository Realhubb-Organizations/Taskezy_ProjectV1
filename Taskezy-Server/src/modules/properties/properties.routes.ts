import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { createPropertySchema, editPropertySchema, listPropertiesQuerySchema, propertyIdParamSchema } from "./properties.schema";
import * as repo from "./properties.repository";

export const propertiesRouter = Router();

propertiesRouter.use(requireAuth);

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
    const { page, pageSize, search, propertyType, sortDir } = req.query as unknown as {
      page: number; pageSize: number; search?: string; propertyType?: string[]; sortDir?: "asc" | "desc";
    };
    const { rows, totalCount } = await repo.findMany({ page, pageSize, search, propertyType, sortDir });
    sendPaginated(res, rows, { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) });
  })
);

propertiesRouter.get(
  "/:id",
  validate({ params: propertyIdParamSchema }),
  asyncHandler(async (req, res) => {
    const property = await repo.findById(req.params.id);
    if (!property) throw ApiError.notFound("Property not found");
    sendOk(res, property);
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

const setTeamMembersSchema = z.object({
  members: z.array(z.object({
    userId: z.string().uuid(),
    percentage: z.number().min(0).max(100).optional()
  })).max(100)
});

propertiesRouter.put(
  "/:id/team-members",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema, body: setTeamMembersSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
    try {
      await repo.replaceTeamMembersForProperty(req.params.id, req.body.members);
    } catch (err) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503") {
        throw ApiError.badRequest("One of these users doesn't exist.");
      }
      throw err;
    }
    sendOk(res, await repo.findById(req.params.id));
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

propertiesRouter.put(
  "/:id/meta-campaigns",
  requireRole("ADMIN"),
  validate({ params: propertyIdParamSchema, body: setMetaCampaignsSchema }),
  asyncHandler(async (req, res) => {
    const existing = await repo.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Property not found");
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
