import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { pool, query } from "../../db/pool";

export const resaleUnitsRouter = Router();

resaleUnitsRouter.use(requireAuth);

// Real server-side pagination, same page/pageSize + LIMIT/OFFSET + count(*)
// shape as GET /leads and GET /properties — this module previously had no
// separate schema/repository files, so the query schema and SQL stay inline
// here rather than introducing a split this module never had.
const listResaleUnitsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // No existing frontend default to match (the Resale page had no
  // pagination UI at all before this) — 10 is TablePagination's own built-in
  // default (see frontend/src/components/ui/TablePagination.tsx's
  // DEFAULT_ROWS_PER_PAGE_OPTIONS), reused here as the most defensible
  // "house" default. Capped at 500 as a safety bound, same convention as
  // leads/properties.
  pageSize: z.coerce.number().int().positive().max(500).default(10),
  // Matches the Resale page's existing search box (property/builder/location).
  search: z.string().trim().max(200).optional(),
  // Matches the Resale page's existing Builder dropdown ("All" = omitted).
  builder: z.string().trim().max(200).optional()
});

resaleUnitsRouter.get(
  "/",
  validate({ query: listResaleUnitsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search, builder } = req.query as unknown as {
      page: number; pageSize: number; search?: string; builder?: string;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(property_name ILIKE $${params.length} OR builder ILIKE $${params.length} OR location ILIKE $${params.length})`);
    }
    if (builder) {
      params.push(builder);
      conditions.push(`builder = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query<{ count: string }>(`SELECT count(*) FROM resale_units ${whereClause}`, params);

    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const { rows } = await query(
      `SELECT id, property_name, builder, location, price, description, listed_by
       FROM resale_units ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const totalCount = Number(countResult.rows[0]?.count ?? 0);
    sendPaginated(res, rows, { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) });
  })
);

const createResaleUnitSchema = z.object({
  propertyName: z.string().trim().min(1).max(300),
  builder: z.string().max(200).optional(),
  location: z.string().max(300).optional(),
  price: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  listedBy: z.string().max(200).optional()
});

resaleUnitsRouter.post(
  "/",
  validate({ body: createResaleUnitSchema }),
  asyncHandler(async (req, res) => {
    const { propertyName, builder, location, price, description, listedBy } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO resale_units (property_name, builder, location, price, description, listed_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, property_name, builder, location, price, description, listed_by`,
      [propertyName, builder ?? null, location ?? null, price ?? null, description ?? null, listedBy ?? null]
    );
    sendOk(res, rows[0], 201);
  })
);
