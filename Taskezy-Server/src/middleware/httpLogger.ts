import type { IncomingMessage, ServerResponse } from "http";
import pinoHttp from "pino-http";
import { logger } from "../utils/logger";

// Query-string keys that can ever carry a live credential — the SSE stream
// endpoint's one-time ticket (notifications.routes.ts) chief among them.
// Scrubbed even though a ticket is single-use and expires in seconds, since
// "already fairly safe" isn't the same as "safe to log verbatim".
const SENSITIVE_QUERY_KEYS = ["ticket", "access_token", "token"];

function scrubUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl;
  const [path, query] = rawUrl.split("?");
  if (!query) return rawUrl;
  const params = new URLSearchParams(query);
  let touched = false;
  for (const key of SENSITIVE_QUERY_KEYS) {
    if (params.has(key)) {
      params.set(key, "redacted");
      touched = true;
    }
  }
  return touched ? `${path}?${params.toString()}` : rawUrl;
}

// Deliberately minimal by default: method + (query-scrubbed) url + status
// only. Headers — which is where the Authorization header and the
// httpOnly refresh-token cookie previously leaked into every access-log
// line via pino-http's default serializer — are never serialized into logs
// at all. If a future debugging need genuinely requires a specific header,
// add it here explicitly and deliberately rather than reverting to "log
// the whole headers object". Exported separately from createHttpLogger so
// scripts/check-log-redaction.ts can exercise it directly without spinning
// up the full pino-http pipeline.
export const httpLoggerSerializers = {
  req(req: IncomingMessage & { url?: string }) {
    return { method: req.method, url: scrubUrl(req.url) };
  },
  res(res: ServerResponse) {
    return { statusCode: res.statusCode };
  }
};

export function createHttpLogger() {
  return pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/health" },
    serializers: httpLoggerSerializers
  });
}
