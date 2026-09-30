/**
 * Regression guard for the credential-logging fix (see src/middleware/httpLogger.ts).
 * Exercises the actual serializers used by the app's HTTP logger with fake
 * requests carrying obviously-fake "secrets", and fails the build if any of
 * those raw values would end up in what gets logged. Run via `npm run
 * guard:logs` — wired into `npm run build` so a future change to the logging
 * setup can't silently reintroduce this class of bug.
 */
import { httpLoggerSerializers } from "../src/middleware/httpLogger";

const SECRET = "TOTALLY-SECRET-TEST-VALUE-do-not-log-me";

function fail(message: string): never {
  console.error(`❌ Log-redaction guard FAILED: ${message}`);
  process.exit(1);
}

// 1. An Authorization header and a refresh-token cookie must never appear in
//    the serialized request — in fact, headers must not be serialized at all.
const fakeReqWithHeaders = {
  method: "GET",
  url: "/api/v1/leads",
  headers: {
    authorization: `Bearer ${SECRET}`,
    cookie: `taskezy_refresh_token=${SECRET}`
  }
} as unknown as Parameters<typeof httpLoggerSerializers.req>[0];

const serializedReq = JSON.stringify(httpLoggerSerializers.req(fakeReqWithHeaders));
if (serializedReq.includes(SECRET)) {
  fail(`the serialized request contains a raw secret: ${serializedReq}`);
}
if ("headers" in httpLoggerSerializers.req(fakeReqWithHeaders)) {
  fail("the serialized request still includes a \"headers\" field — headers must never be logged");
}

// 2. An SSE ticket (or any token-shaped query param) must be scrubbed from
//    the logged URL, not passed through verbatim.
const fakeReqWithTicket = {
  method: "GET",
  url: `/api/v1/notifications/stream?ticket=${SECRET}`,
  headers: {}
} as unknown as Parameters<typeof httpLoggerSerializers.req>[0];

const serializedTicketReq = JSON.stringify(httpLoggerSerializers.req(fakeReqWithTicket));
if (serializedTicketReq.includes(SECRET)) {
  fail(`an SSE ticket / access_token query-string value leaked into the log line: ${serializedTicketReq}`);
}

console.log("✅ Log-redaction guard passed — no credentials found in what would be logged.");
