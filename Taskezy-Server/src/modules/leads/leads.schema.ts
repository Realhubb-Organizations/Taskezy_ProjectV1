import { z } from "zod";

// Same 10-digit Indian mobile rule already enforced as a CHECK constraint in
// schema.sql — validated here too so a bad request is rejected with a clean
// 400 before it ever reaches the database.
const phoneRegex = /^[6-9][0-9]{9}$/;

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  status: z.string().optional(),
  assignedAgentId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional()
});

export const leadIdParamSchema = z.object({
  id: z.string().uuid()
});

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().regex(phoneRegex, "Phone must be a valid 10-digit Indian mobile number"),
  email: z.string().email().optional(),
  source: z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  propertyId: z.string().uuid().optional(),
  assignedAgentId: z.string().uuid()
});

export const updateLeadStatusSchema = z.object({
  statusCode: z.string().min(1),
  dealValue: z.number().nonnegative().optional()
});

export const editLeadSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  source: z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  propertyId: z.string().uuid().nullable().optional(),
  leadScore: z.number().int().min(0).max(100).optional()
}).refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export const reassignLeadSchema = z.object({
  newAgentId: z.string().uuid()
});
