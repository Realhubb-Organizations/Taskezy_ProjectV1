import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { authRateLimiter, refreshRateLimiter } from "../../middleware/rateLimiter";
import { asyncHandler } from "../../utils/asyncHandler";
import { validate } from "../../middleware/validate";
import { changePasswordSchema, loginSchema } from "./auth.schema";
import { changePasswordHandler, loginHandler, logoutHandler, meHandler, refreshHandler } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), asyncHandler(loginHandler));
authRouter.post("/refresh", refreshRateLimiter, asyncHandler(refreshHandler));
authRouter.post("/logout", requireAuth, asyncHandler(logoutHandler));
authRouter.get("/me", requireAuth, asyncHandler(meHandler));
authRouter.patch(
  "/password",
  requireAuth,
  validate({ body: changePasswordSchema }),
  asyncHandler(changePasswordHandler)
);
