import { Request, Response } from "express";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { boss, BULK_IMPORT_LEADS_QUEUE } from "../../jobs/queue";
import { leadForCaller } from "./leads.handover";
import * as leadsService from "./leads.service";

export async function listLeadsHandler(req: Request, res: Response): Promise<void> {
  const { page, pageSize, status, assignedAgentId, campaign, dateFrom, dateTo, search, excludeBulkUpload } = req.query as unknown as {
    page: number; pageSize: number; status?: string[]; assignedAgentId?: string[]; campaign?: string[];
    dateFrom?: string; dateTo?: string; search?: string; excludeBulkUpload?: boolean;
  };
  const { rows, meta } = await leadsService.listLeads(req.user!, { page, pageSize, status, assignedAgentId, campaign, dateFrom, dateTo, search, excludeBulkUpload });
  sendPaginated(res, rows.map(r => leadForCaller(req.user!, r)), meta);
}

export async function getLeadStatsHandler(req: Request, res: Response): Promise<void> {
  const { status, assignedAgentId, campaign, dateFrom, dateTo, search, excludeBulkUpload } = req.query as unknown as {
    status?: string[]; assignedAgentId?: string[]; campaign?: string[]; dateFrom?: string; dateTo?: string; search?: string;
    excludeBulkUpload?: boolean;
  };
  const stats = await leadsService.getLeadStats(req.user!, { status, assignedAgentId, campaign, dateFrom, dateTo, search, excludeBulkUpload });
  sendOk(res, stats);
}

export async function getLeadHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.getLead(req.user!, req.params.id);
  sendOk(res, leadForCaller(req.user!, lead));
}

export async function createLeadHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.createLead(req.user!, req.body);
  sendOk(res, leadForCaller(req.user!, lead), 201);
}

export async function updateLeadStatusHandler(req: Request, res: Response): Promise<void> {
  const { statusCode, dealValue } = req.body;
  const lead = await leadsService.updateLeadStatus(req.user!, req.params.id, statusCode, dealValue);
  sendOk(res, leadForCaller(req.user!, lead));
}

export async function updateCallStatusHandler(req: Request, res: Response): Promise<void> {
  const { callStatus } = req.body;
  const lead = await leadsService.updateCallStatus(req.user!, req.params.id, callStatus);
  sendOk(res, leadForCaller(req.user!, lead));
}

export async function editLeadHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.editLead(req.user!, req.params.id, req.body);
  sendOk(res, leadForCaller(req.user!, lead));
}

// Queued, not run inline — a real admin upload can be 100k+ rows (see
// leads.schema.ts's bulkImportLeadsSchema), long enough to risk an upstream
// proxy timeout if awaited in the request. The actual import logic is
// unchanged (leadsService.bulkImportLeads, now run by the worker registered
// in jobs/queue.ts); this just hands the validated body to pg-boss and
// returns the job id for the frontend to poll via the status route below.
export async function bulkImportLeadsHandler(req: Request, res: Response): Promise<void> {
  // Checked here, before queueing — the worker runs without a caller.
  await leadsService.assertBulkImportAllowed(req.user!, req.body);
  const jobId = await boss.send(BULK_IMPORT_LEADS_QUEUE, req.body);
  if (!jobId) throw ApiError.internal("Could not queue the import — try again.");
  sendOk(res, { jobId }, 202);
}

export async function getBulkImportStatusHandler(req: Request, res: Response): Promise<void> {
  const [job] = await boss.findJobs(BULK_IMPORT_LEADS_QUEUE, { id: req.params.jobId });
  if (!job) throw ApiError.notFound("Import job not found");
  sendOk(res, {
    state: job.state,
    result: job.state === "completed" ? (job.output as leadsService.BulkImportLeadsResult) : undefined
  });
}

export async function reassignLeadHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.reassignLead(req.user!, req.params.id, req.body.newAgentId, req.body.note);
  sendOk(res, leadForCaller(req.user!, lead));
}

export async function updateLeadNoteHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.updateLeadNote(req.user!, req.params.id, req.body.note);
  sendOk(res, leadForCaller(req.user!, lead));
}

export async function reassignUnassignedSheetLeadsHandler(req: Request, res: Response): Promise<void> {
  const result = await leadsService.reassignUnassignedSheetLeads(req.user!);
  sendOk(res, result);
}

export async function fixSheetLeadTimestampsHandler(_req: Request, res: Response): Promise<void> {
  const result = await leadsService.fixSheetLeadTimestamps();
  sendOk(res, result);
}

export async function deleteLeadHandler(req: Request, res: Response): Promise<void> {
  await leadsService.deleteLead({ userId: req.user!.sub, name: req.user!.name }, req.params.id);
  sendOk(res, { deleted: true });
}

export async function bulkDeleteLeadsHandler(req: Request, res: Response): Promise<void> {
  const result = await leadsService.bulkDeleteLeads({ userId: req.user!.sub, name: req.user!.name }, req.body.leadIds);
  sendOk(res, result);
}

export async function verifyLeadKycHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.verifyLeadKyc(req.params.id);
  sendOk(res, leadForCaller(req.user!, lead));
}
