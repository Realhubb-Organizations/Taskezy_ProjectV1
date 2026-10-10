import { z } from "zod";
import { optionalIndianMobile } from "../../utils/validation";

export const propertyIdParamSchema = z.object({ id: z.string().uuid() });

// Same normalization as leads.schema.ts's stringToArray — Express's default
// `qs` parser turns a single `?propertyType=A` into a bare string but
// repeated `?propertyType=A&propertyType=B` into an array; this folds either
// shape into one plain array (or undefined if omitted).
const stringToArray = z.union([z.string(), z.array(z.string())])
  .optional()
  .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v]));

export const listPropertiesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // 100 matches the Properties admin page's own default rowsPerPage (see
  // frontend/.../dashboard/properties/page.tsx) — most tenants' full
  // property list already fits on one page at that size. Capped at 500 as a
  // real safety bound (same convention as leads.schema.ts), and reused by
  // apiListProperties()'s "fetch everything" bridge for AppContext's other
  // (dropdown-picker) consumers, which pages through at that same cap.
  pageSize: z.coerce.number().int().positive().max(500).default(100),
  // Matches the admin table's search box (name/developer/location).
  search: z.string().trim().max(200).optional(),
  // Matches the admin table's Property Type column filter. A property can
  // have several types stored as one comma-joined string column
  // ("Apartment, Villa") — matches if ANY selected type is one of a
  // property's own types, mirroring the frontend's splitPropertyTypes().some(...).
  propertyType: stringToArray,
  // Matches the admin table's Date column sort toggle.
  sortDir: z.enum(["asc", "desc"]).optional()
});

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
  // Empty clears it; anything else must be a 10-digit mobile (stored bare).
  contactNumber: optionalIndianMobile,
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
