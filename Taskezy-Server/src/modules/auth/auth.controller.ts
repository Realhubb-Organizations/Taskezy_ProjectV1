import { Request, Response } from "express";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { sendOk } from "../../utils/apiResponse";
import * as authService from "./auth.service";

const REFRESH_COOKIE_NAME = "taskezy_refresh_token";

// httpOnly + sameSite=strict so the refresh token is inaccessible to JS
// (mitigates XSS token theft) and never sent cross-site (mitigates CSRF).
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
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
