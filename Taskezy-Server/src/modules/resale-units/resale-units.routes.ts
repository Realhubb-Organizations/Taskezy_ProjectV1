import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { pool, query } from "../../db/pool";

export const resaleUnitsRouter = Router();

resaleUnitsRouter.use(requireAuth);

resaleUnitsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, property_name, builder, location, price, description, listed_by
       FROM resale_units ORDER BY created_at DESC`
    );
    sendOk(res, rows);
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
