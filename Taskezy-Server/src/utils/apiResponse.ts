import { Response } from "express";

// One consistent response shape across every endpoint — makes the frontend's
// API client trivial to write generically instead of per-endpoint.
export function sendOk<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export function sendPaginated<T>(res: Response, data: T[], meta: PaginationMeta): void {
  res.status(200).json({ success: true, data, meta });
}
