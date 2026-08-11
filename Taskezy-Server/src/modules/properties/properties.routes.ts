import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { createPropertySchema, editPropertySchema, propertyIdParamSchema } from "./properties.schema";
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
  "/",
  asyncHandler(async (_req, res) => sendOk(res, await repo.findAll()))
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
