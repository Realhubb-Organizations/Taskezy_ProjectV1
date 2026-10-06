# Multi-stage build: compile TypeScript in a full Node image, run the
# compiled JS in a minimal one — the final image never contains dev
# dependencies, TypeScript source, or the compiler itself.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# bcrypt (native addon, replacing the pure-JS bcryptjs — see utils/password.ts)
# needs a C++ toolchain to build on Alpine/musl if no matching prebuilt
# binary is published for it; installed as a virtual package and removed in
# the same layer so it doesn't linger in this stage's image either.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci \
  && apk del .build-deps
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# `npm run build` now runs the log-redaction regression guard first (see
# scripts/check-log-redaction.ts), which imports src/config/env.ts — that
# module fail-fast-validates every required env var via Zod and calls
# process.exit(1) if one is missing, by design, so real deploys never boot
# on a half-configured environment. This build stage has no access to the
# real runtime secrets (those are injected into the `runtime` stage below at
# container start, never baked into an image layer), so these are dummy
# values that only need to satisfy Zod's shape checks (min length / URL /
# digits-only) — never real credentials, and discarded along with the rest
# of this stage's filesystem once `COPY --from=build /app/dist` below runs.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
  JWT_ACCESS_SECRET=build-time-placeholder-not-a-real-secret-000000 \
  JWT_REFRESH_SECRET=build-time-placeholder-not-a-real-secret-000000 \
  META_APP_ID=build-placeholder \
  META_APP_SECRET=build-placeholder \
  META_WEBHOOK_VERIFY_TOKEN=build-placeholder \
  META_OAUTH_REDIRECT_URI=https://example.com/api/v1/meta/callback \
  TOKEN_ENCRYPTION_KEY=build-placeholder \
  FRONTEND_URL=https://example.com \
  GOOGLE_ADS_CLIENT_ID=build-placeholder \
  GOOGLE_ADS_CLIENT_SECRET=build-placeholder \
  GOOGLE_ADS_DEVELOPER_TOKEN=build-placeholder \
  GOOGLE_ADS_REFRESH_TOKEN=build-placeholder \
  GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890 \
  SHEET_IMPORT_API_KEY=build-time-placeholder-16chars
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Non-root user — never run the process as root in the container.
RUN addgroup -S taskezy && adduser -S taskezy -G taskezy

COPY package*.json ./
# Same native-addon build toolchain as above, transient for this stage too —
# the final image ends up with neither compiler present.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev \
  && apk del .build-deps
COPY --from=build /app/dist ./dist

USER taskezy
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
