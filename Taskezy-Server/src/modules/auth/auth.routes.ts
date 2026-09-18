import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { authRateLimiter, refreshRateLimiter } from "../../middleware/rateLimiter";
import { asyncHandler } from "../../utils/asyncHandler";
import { validate } from "../../middleware/validate";
import { loginSchema } from "./auth.schema";
import { loginHandler, logoutHandler, meHandler, refreshHandler } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), asyncHandler(loginHandler));
authRouter.post("/refresh", refreshRateLimiter, asyncHandler(refreshHandler));
authRouter.post("/logout", asyncHandler(logoutHandler));
authRouter.get("/me", requireAuth, asyncHandler(meHandler));
