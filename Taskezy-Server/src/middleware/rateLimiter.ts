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
//
// Keyed by IP+email (not IP alone): a small office/team sharing one public
// IP was pooling every admin/agent's login attempts into a single 10-per-
// 15-min bucket, so a handful of people logging in around the same time —
// or one person mistyping a password a few times — could lock out everyone
// else on that IP. Keying on the email too means each account still gets
// its own real budget per IP, so a genuine brute-force attempt against one
// account is throttled exactly as before; it's specifically the
// "different real users, same IP" case that no longer collides.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email ? `${req.ip}:${email}` : (req.ip ?? "unknown");
  },
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many auth attempts, please try again later" } }
});
