import { z } from "zod";
import { indianMobile } from "../../utils/validation";
import { LEAD_STATUS_CODES } from "./leadStatusTransitions";

// Express's default `qs` query parser turns a single `?status=A` into a bare
// string but repeated `?status=A&status=B` into an array — these two helpers
// normalize either shape into a plain array (or undefined if omitted) so the
// repository only ever has to deal with one shape.
const stringToArray = z.union([z.string(), z.array(z.string())])
  .optional()
  .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v]));

const uuidToArray = z.union([z.string().uuid(), z.array(z.string().uuid())])
  .optional()
  .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v]));

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // 500 (was 100) — apiListAllLeads() pages through this endpoint to
  // reconstruct the full leads list for the frontend, and 100 meant ~91
  // sequential round trips at the ~9k leads this system already has (and
  // growing, with 100k+-row bulk uploads now possible). Still a real,
  // bounded cap against an abusive/malformed request, not "return
  // everything in one query" — just sized to cut that round-trip count by
  // 5x for the common "fetch everything" case.
  pageSize: z.coerce.number().int().positive().max(500).default(25),
  // Admin CRM's leads table lets admins check multiple statuses at once —
  // accepts either a single value or repeated query params and normalizes
  // both to an array.
  status: stringToArray,
  assignedAgentId: uuidToArray,
  // Matches lead.campaign || lead.source in the frontend's client-side
  // filter (see leads.repository.ts's findMany) — same multi-select shape
  // as status/assignedAgentId.
  campaign: stringToArray,
  // Plain ISO calendar-date bounds (YYYY-MM-DD) on created_at. The frontend
  // computes the actual boundaries from its date-range presets
  // (today/yesterday/week/month/custom) before sending the request.
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD").optional(),
  search: z.string().trim().max(200).optional(),
  // "true" leaves out Data Calling leads (source "Bulk Upload"), which only
  // show on the Data Calling page until they're qualified.
  excludeBulkUpload: z.enum(["true", "false"]).optional().transform(v => v === "true")
});

// Same filter shape as listLeadsQuerySchema (status/assignedAgentId/campaign/
// dateFrom/dateTo/search) minus page/pageSize, which are meaningless for an
// aggregate — a caller can pass the exact same filter query params to both
// `GET /` and `GET /stats` and get consistent, filter-matching results.
export const leadStatsQuerySchema = listLeadsQuerySchema.omit({ page: true, pageSize: true });

// Leads Analytics tab's own filter set (Property/Campaign/Date Range) —
// deliberately NOT listLeadsQuerySchema.omit(...) like leadStatsQuerySchema
// above, since this tab has no status/search/excludeBulkUpload filters but
// does have a Property one the plain Leads tab doesn't.
export const leadAnalyticsStatsQuerySchema = z.object({
  propertyId: uuidToArray,
  campaign: stringToArray,
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD").optional()
});

// Manager report's per-agent rollup (ManagerReports.tsx) — just a date
// range, same bounds format as every other stats endpoint; grouping by
// agent/manager/team happens server-side (GROUP BY) or client-side
// (the Individual/Team/Combined roll-up), not via a request filter here.
export const managerReportStatsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD").optional()
});

export const leadIdParamSchema = z.object({
  id: z.string().uuid()
});

export const bulkImportJobIdParamSchema = z.object({
  jobId: z.string().uuid()
});

export const createLeadSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  // "+91 98450 12345", "098450…" etc. are accepted and stored as 10 bare digits.
  phone: indianMobile,
  email: z.string().trim().email("Enter a valid email address").max(254).optional(),
  source: z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  propertyId: z.string().uuid().optional(),
  assignedAgentId: z.string().uuid()
});

export const updateLeadStatusSchema = z.object({
  statusCode: z.enum(LEAD_STATUS_CODES),
  dealValue: z.number().nonnegative().optional()
});

// Data Calling's own, independent field (see migration 030) — separate
// endpoint from the main Lead Status above, since the two are no longer
// the same column and have no transition rules between them.
// callSubStatus (migration 033) is optional and only accepted with
// Connected — Called / Not Reachable / Wrong Number never carry one. A note
// is required with every call status update (saved as the lead's note in
// the same transaction; same rules as noteText below).
export const updateCallStatusSchema = z
  .object({
    callStatus: z.enum(["Connected", "Called", "Not Reachable", "Wrong Number"]),
    callSubStatus: z.enum(["Qualified", "Unqualified"]).nullable().optional(),
    note: z.string().trim().min(1, "Please write a note").max(2000, "Notes are limited to 2,000 characters")
  })
  .refine(d => !d.callSubStatus || d.callStatus === "Connected", {
    message: "Sub-status can only be set when the call status is Connected.",
    path: ["callSubStatus"]
  });

export const editLeadSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  source: z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  propertyId: z.string().uuid().nullable().optional(),
  leadScore: z.number().int().min(0).max(100).optional()
}).refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

// A note is required on every reassignment so the next agent knows why.
const noteText = z.string().trim().min(1, "Please write a note").max(2000, "Notes are limited to 2,000 characters");

export const reassignLeadSchema = z.object({
  newAgentId: z.string().uuid(),
  note: noteText
});

export const updateLeadNoteSchema = z.object({
  note: noteText
});

export const bulkDeleteLeadsSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(500)
});

export const bulkDeleteJobIdParamSchema = z.object({
  jobId: z.string().uuid()
});

// Backs both Data Calling's and the main CRM Leads page's bulk Assign/
// Reshuffle toolbar actions (see leads.service.ts's bulkReassignLeads) —
// same note requirement as single-lead reassign (reassignLeadSchema).
export const bulkReassignLeadsSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(5000),
  newAgentId: z.string().uuid(),
  note: noteText
});

export const bulkReassignJobIdParamSchema = z.object({
  jobId: z.string().uuid()
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
