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

// Tighter limiter specifically for login — this is what actually matters
// for security (brute-forcing a password), separate from the general
// traffic limiter above so normal API usage never fights with it.
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

// /auth/refresh is NOT a brute-forceable-credential endpoint the way
// /login is — it takes no password, just the caller's own httpOnly
// refresh-token cookie, so there's nothing here to guess and this limiter
// is only ever a backstop against a runaway/buggy client, not a security
// boundary. It needs real headroom: an access token expiring while the
// frontend has ~14 requests in flight (loadAllRealData) means all ~14 hit
// a 401 and attempt a refresh around the same moment — deduplicated
// client-side now (see apiClient.ts's refreshPromise), but multiple open
// tabs each doing their own token lifecycle, or a client on an older
// deploy without that fix, can still legitimately produce several refresh
// calls close together. Sharing /login's strict 10/15min budget meant that
// burst alone could exhaust it, turning an expired token into "Too many
// login attempts" for a real, innocent user.
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many refresh attempts, please try again later" } }
});
