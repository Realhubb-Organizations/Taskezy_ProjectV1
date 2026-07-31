import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// General API-wide limiter — generous, just a backstop against abuse/runaway clients.
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" } }
});

// Tighter limiter specifically for auth endpoints — this is what actually
// matters for security (brute-forcing login/refresh), separate from the
// general traffic limiter above so normal API usage never fights with it.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many auth attempts, please try again later" } }
});
