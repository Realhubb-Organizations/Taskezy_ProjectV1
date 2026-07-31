import { z } from "zod";

export const propertyIdParamSchema = z.object({ id: z.string().uuid() });

const basePropertyFields = {
  name: z.string().trim().min(1).max(200),
  developer: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(300),
  locality: z.string().max(300).optional(),
  zone: z.string().max(100).optional(),
  priceValue: z.number().nonnegative().optional(),
  priceType: z.enum(["ABSOLUTE", "STARTING_FROM"]).optional(),
  propertyType: z.string().trim().min(1).max(100),
  propertyStatus: z.string().max(100).optional(),
  description: z.string().max(5000).optional(),
  possessionDate: z.string().optional(), // YYYY-MM-DD
  landParcel: z.string().max(200).optional(),
  towers: z.string().max(200).optional(),
  structure: z.string().max(200).optional(),
  amenities: z.array(z.string().max(200)).max(50).optional(),
  contactNumber: z.string().max(30).optional(),
  mapUrl: z.string().url().max(1000).optional().or(z.literal("")),
  websiteUrl: z.string().url().max(1000).optional().or(z.literal("")),
  brochureUrl: z.string().url().max(1000).optional().or(z.literal("")),
  leadRegistrationUrl: z.string().url().max(1000).optional().or(z.literal("")),
  tags: z.array(z.string().max(100)).max(50).optional(),
  mediaFileNames: z.array(z.string().max(300)).max(100).optional(),
  teamAssignmentMode: z.enum(["ALL_MEMBERS", "CUSTOM_MEMBERS"]).optional(),
  leadAssignmentMode: z.enum(["ROUND_ROBIN", "PERCENTAGE"]).optional()
};

export const createPropertySchema = z.object(basePropertyFields);

// Every field optional for edit — same PATCH semantics as leads.editLeadSchema.
export const editPropertySchema = z.object(
  Object.fromEntries(Object.entries(basePropertyFields).map(([k, v]) => [k, v.optional()]))
).refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });
