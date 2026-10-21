import { Router } from "express";
import { requireAuthAllowPasswordReset } from "../../middleware/auth";
import { authRateLimiter, googleAuthRateLimiter, refreshRateLimiter } from "../../middleware/rateLimiter";
import { asyncHandler } from "../../utils/asyncHandler";
import { validate } from "../../middleware/validate";
import { changePasswordSchema, googleLoginSchema, loginSchema } from "./auth.schema";
import { changePasswordHandler, googleLoginHandler, loginHandler, logoutHandler, meHandler, refreshHandler } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), asyncHandler(loginHandler));
authRouter.post("/google", googleAuthRateLimiter, validate({ body: googleLoginSchema }), asyncHandler(googleLoginHandler));
authRouter.post("/refresh", refreshRateLimiter, asyncHandler(refreshHandler));
authRouter.post("/logout", requireAuthAllowPasswordReset, asyncHandler(logoutHandler));
authRouter.get("/me", requireAuthAllowPasswordReset, asyncHandler(meHandler));
authRouter.patch(
  "/password",
  requireAuthAllowPasswordReset,
  validate({ body: changePasswordSchema }),
  asyncHandler(changePasswordHandler)
);
