/**
 * Thrown deliberately anywhere in the app to produce a clean HTTP error
 * response. Anything NOT an ApiError that reaches the error handler is
 * treated as an unexpected bug and its details are hidden from the client
 * (see middleware/errorHandler.ts) — this class is the only sanctioned way
 * to surface a specific message/status code to a caller.
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "ERROR",
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, "BAD_REQUEST", details);
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message, "UNAUTHORIZED");
  }
  static forbidden(message = "You do not have permission to perform this action") {
    return new ApiError(403, message, "FORBIDDEN");
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, message, "NOT_FOUND");
  }
  static conflict(message: string) {
    return new ApiError(409, message, "CONFLICT");
  }
  static tooManyRequests(message = "Too many requests, please try again later") {
    return new ApiError(429, message, "RATE_LIMITED");
  }
  static internal(message = "Something went wrong") {
    return new ApiError(500, message, "INTERNAL_ERROR");
  }
}
