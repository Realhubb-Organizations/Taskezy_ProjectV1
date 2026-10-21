import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { AccessTokenPayload, verifyAccessToken } from "../utils/tokens";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      /** Raw request body bytes, captured by express.json()'s verify hook — needed for Meta's X-Hub-Signature-256 check (a re-serialized JSON body would not match the signature). */
      rawBody?: Buffer;
    }
  }
}

function readAccessToken(req: Request): AccessTokenPayload {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized();
  }
  const token = header.slice("Bearer ".length);
  try {
    return verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired access token");
  }
}

/**
 * Requires a valid access token; attaches the decoded payload to req.user.
 * A session that still has to replace its temporary password is refused
 * here — the reset screen is not the only thing standing between it and
 * the data.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  req.user = readAccessToken(req);
  if (req.user.mustResetPassword) {
    throw ApiError.forbidden("Please set a new password before continuing.");
  }
  next();
}

/** requireAuth minus the temporary-password block — only for /auth/me, /auth/logout and /auth/password. */
export function requireAuthAllowPasswordReset(req: Request, _res: Response, next: NextFunction): void {
  req.user = readAccessToken(req);
  next();
}

/** Restricts a route to specific roles — mirrors the frontend's Role type (ADMIN/FINANCE/AGENT). */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw ApiError.unauthorized();
    if (!allowedRoles.includes(req.user.role)) {
      throw ApiError.forbidden();
    }
    next();
  };
}

/**
 * Admins and sales managers only — for actions agents can't take, e.g.
 * uploading or reassigning leads. `action` names it in the refusal message.
 */
export function requireAdminOrManager(action: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== "ADMIN" && req.user.roleType !== "MANAGER") {
      throw ApiError.forbidden(`Only admins and managers can ${action}.`);
    }
    next();
  };
}
