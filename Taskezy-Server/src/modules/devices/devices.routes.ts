import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { query } from "../../db/pool";

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

const tokenSchema = z.string().min(1).max(4096);

const registerSchema = z.object({
  token: tokenSchema,
  platform: z.enum(["android", "ios"]).default("android")
});

// A token belongs to whichever user registered it last (e.g. shared phone),
// so the upsert reassigns user_id rather than failing on the unique token.
devicesRouter.post(
  "/",
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { token, platform } = req.body as z.infer<typeof registerSchema>;
    await query(
      `INSERT INTO user_devices (user_id, token, platform, last_seen_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (token) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         platform = EXCLUDED.platform,
         last_seen_at = now()`,
      [req.user!.sub, token, platform]
    );
    sendOk(res, { registered: true }, 201);
  })
);

// Only the caller's own token can be removed; anyone else's is a silent no-op.
devicesRouter.delete(
  "/:token",
  validate({ params: z.object({ token: tokenSchema }) }),
  asyncHandler(async (req, res) => {
    await query(
      `DELETE FROM user_devices WHERE token = $1 AND user_id = $2`,
      [req.params.token, req.user!.sub]
    );
    sendOk(res, { removed: true });
  })
);
