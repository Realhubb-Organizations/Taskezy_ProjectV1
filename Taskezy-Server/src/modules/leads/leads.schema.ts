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

// Bulk upload rows are deliberately NOT phone-regex-validated here the way
// createLeadSchema is — an admin's Excel sheet is messy (formatting,
// +91 prefixes, stray spaces), so invalid rows are normalized/validated
// per-row in the service layer and skipped with a reason instead of
// rejecting the whole batch over one bad row.
export const bulkImportLeadsSchema = z
  .object({
    subSource: z.string().trim().min(1, "Sub-source is required").max(200),
    assignmentMode: z.enum(["PROPERTY", "AGENT"]),
    propertyId: z.string().uuid().optional(),
    // Agent mode round-robins rows evenly across every selected agent (see
    // leads.service.ts's bulkImportLeads) rather than dumping the whole
    // batch on one person.
    agentIds: z.array(z.string().uuid()).optional(),
    leads: z
      .array(
        z.object({
          name: z.string().max(200).optional().default(""),
          phone: z.string().max(30).optional().default("")
        })
      )
      .min(1, "At least one lead row is required")
      // Real batches run to 100k+ rows — bulkImportLeads processes these in
      // chunked bulk inserts (see leads.repository's createBulkLeadsChunk),
      // not one row at a time, so this ceiling is a sanity bound against a
      // malformed/absurd request, not a real throughput limit.
      .max(200_000, "A single upload is limited to 200,000 rows")
  })
  .refine(d => d.assignmentMode !== "PROPERTY" || !!d.propertyId, {
    message: "propertyId is required for Property assignment mode",
    path: ["propertyId"]
  })
  .refine(d => d.assignmentMode !== "AGENT" || (!!d.agentIds && d.agentIds.length > 0), {
    message: "At least one agentId is required for Agent assignment mode",
    path: ["agentIds"]
  });
