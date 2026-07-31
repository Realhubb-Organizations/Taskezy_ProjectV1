import { Request, Response } from "express";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import * as leadsService from "./leads.service";

export async function listLeadsHandler(req: Request, res: Response): Promise<void> {
  const { page, pageSize, status, assignedAgentId, search } = req.query as unknown as {
    page: number; pageSize: number; status?: string; assignedAgentId?: string; search?: string;
  };
  const { rows, meta } = await leadsService.listLeads(req.user!, { page, pageSize, status, assignedAgentId, search });
  sendPaginated(res, rows, meta);
}

export async function getLeadHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.getLead(req.user!, req.params.id);
  sendOk(res, lead);
}

export async function createLeadHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.createLead(req.user!, req.body);
  sendOk(res, lead, 201);
}

export async function updateLeadStatusHandler(req: Request, res: Response): Promise<void> {
  const { statusCode, dealValue } = req.body;
  const lead = await leadsService.updateLeadStatus(req.user!, req.params.id, statusCode, dealValue);
  sendOk(res, lead);
}

export async function editLeadHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.editLead(req.user!, req.params.id, req.body);
  sendOk(res, lead);
}

export async function reassignLeadHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.reassignLead(req.user!, req.params.id, req.body.newAgentId);
  sendOk(res, lead);
}

export async function deleteLeadHandler(req: Request, res: Response): Promise<void> {
  await leadsService.deleteLead(req.params.id);
  sendOk(res, { deleted: true });
}

export async function verifyLeadKycHandler(req: Request, res: Response): Promise<void> {
  const lead = await leadsService.verifyLeadKyc(req.params.id);
  sendOk(res, lead);
}
