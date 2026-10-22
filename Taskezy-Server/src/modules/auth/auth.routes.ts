import { Router } from "express";
import { requireAuthAllowPasswordReset } from "../../middleware/auth";
import { authRateLimiter, googleAuthRateLimiter, loginOtpRateLimiter, refreshRateLimiter } from "../../middleware/rateLimiter";
import { asyncHandler } from "../../utils/asyncHandler";
import { validate } from "../../middleware/validate";
import { changePasswordSchema, googleLoginSchema, loginSchema, resendLoginOtpSchema, verifyLoginOtpSchema } from "./auth.schema";
import {
  changePasswordHandler,
  googleLoginHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  resendLoginOtpHandler,
  verifyLoginOtpHandler
} from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), asyncHandler(loginHandler));
authRouter.post("/login/verify-otp", loginOtpRateLimiter, validate({ body: verifyLoginOtpSchema }), asyncHandler(verifyLoginOtpHandler));
authRouter.post("/login/resend-otp", loginOtpRateLimiter, validate({ body: resendLoginOtpSchema }), asyncHandler(resendLoginOtpHandler));
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
