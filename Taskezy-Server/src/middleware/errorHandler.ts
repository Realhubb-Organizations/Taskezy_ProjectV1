import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route: ${req.method} ${req.path}`));
}

/**
 * express.json()'s body-parser (built on the `raw-body`/`type-is` packages)
 * throws plain errors — not ApiError, not ZodError — tagged with a `type`
 * field for malformed JSON ("entity.parse.failed") and oversized payloads
 * ("entity.too.large", see the 1mb limit in app.ts). Without this check both
 * fell through to the generic 500 branch below, telling the client "server
 * error" for what is actually a client-side bad request.
 */
function getBodyParserErrorResponse(err: unknown): { status: number; code: string; message: string } | null {
  if (typeof err !== "object" || err === null || !("type" in err)) return null;
  switch ((err as { type?: unknown }).type) {
    case "entity.too.large":
      return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
    case "entity.parse.failed":
    case "encoding.unsupported":
      return { status: 400, code: "BAD_REQUEST", message: "Malformed request body" };
    default:
      return null;
  }
}

/**
 * Single place every error in the app funnels through. Deliberate errors
 * (ApiError) return their intended message; anything else is logged with
 * full detail server-side but returns a generic message to the client —
 * stack traces and internal error text must never leak to callers.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const bodyParserError = getBodyParserErrorResponse(err);
  if (bodyParserError) {
    res.status(bodyParserError.status).json({
      success: false,
      error: { code: bodyParserError.code, message: bodyParserError.message }
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() }
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, err.message);
    }
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details }
    });
    return;
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" }
  });
}
