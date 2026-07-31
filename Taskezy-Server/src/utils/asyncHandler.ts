import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route/middleware so a rejected promise reaches Express's
 * error handling instead of becoming an unhandled rejection. Every async
 * route in this codebase should be wrapped with this.
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
