import { Request, Response } from "express";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { sendOk } from "../../utils/apiResponse";
import { refreshTokenMaxAgeMs } from "../../utils/tokens";
import * as loginOtp from "./loginOtp";
import { TRUSTED_DEVICE_DAYS } from "./loginOtp";
import * as authService from "./auth.service";

const REFRESH_COOKIE_NAME = "taskezy_refresh_token";
// "Trust this device" after an email OTP login — same cookie rules as the
// refresh token, so only the auth routes ever see it.
const TRUSTED_DEVICE_COOKIE_NAME = "taskezy_trusted_device";

// httpOnly + sameSite=strict so the refresh token is inaccessible to JS
// (mitigates XSS token theft) and never sent cross-site (mitigates CSRF).
// maxAge is derived from JWT_REFRESH_EXPIRES_IN (env.ts default: 7d) via the
// same helper the DB row's own expiry uses — previously a second, independent
// hardcoded 30-day literal lived here and could silently drift from the env
// value.
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: refreshTokenMaxAgeMs()
  });
}

// Either signs in (same response as before) or answers { otpRequired } and
// emails a code — the browser then calls /login/verify-otp.
export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  const outcome = await authService.login(email, password, req.cookies?.[TRUSTED_DEVICE_COOKIE_NAME], req.get("user-agent"));
  if (outcome.otpRequired) {
    sendOk(res, { otpRequired: true, challengeId: outcome.challengeId, email: outcome.maskedEmail });
    return;
  }
  setRefreshCookie(res, outcome.auth.refreshToken);
  sendOk(res, { accessToken: outcome.auth.accessToken, user: outcome.auth.user });
}

export async function verifyLoginOtpHandler(req: Request, res: Response): Promise<void> {
  const { challengeId, code, trustDevice } = req.body;
  const { auth, trustedDeviceToken } = await authService.completeOtpLogin(challengeId, code, trustDevice, req.get("user-agent"));
  setRefreshCookie(res, auth.refreshToken);
  if (trustedDeviceToken) {
    res.cookie(TRUSTED_DEVICE_COOKIE_NAME, trustedDeviceToken, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000
    });
  }
  sendOk(res, { accessToken: auth.accessToken, user: auth.user });
}

export async function resendLoginOtpHandler(req: Request, res: Response): Promise<void> {
  await loginOtp.resendChallenge(req.body.challengeId, req.get("user-agent"));
  sendOk(res, { resent: true });
}

// Same response and refresh cookie as a password login.
export async function googleLoginHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.loginWithGoogle(req.body.credential);
  setRefreshCookie(res, result.refreshToken);
  sendOk(res, { accessToken: result.accessToken, user: result.user });
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) throw ApiError.unauthorized("No refresh token provided");
  const result = await authService.refresh(token);
  setRefreshCookie(res, result.refreshToken);
  sendOk(res, { accessToken: result.accessToken, user: result.user });
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/v1/auth" });
  sendOk(res, { loggedOut: true });
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const profile = await authService.getProfile(req.user!.sub);
  sendOk(res, profile);
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body;
  const tokens = await authService.changePassword(req.user!.sub, currentPassword, newPassword);
  // Swap the session over to the new token pair (see changePassword) and
  // retire the old refresh token so it can't mint another flagged token.
  const oldRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (oldRefreshToken) await authService.logout(oldRefreshToken);
  setRefreshCookie(res, tokens.refreshToken);
  sendOk(res, { passwordChanged: true, accessToken: tokens.accessToken });
}
