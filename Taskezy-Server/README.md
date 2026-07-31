# TASKEZY API Server

Node.js/TypeScript/Express backend that talks directly to the Postgres database in `../Taskezy_DB`. Separate deployable service from the Next.js frontend (`Taskezy-ProjectV1`, on Netlify) and the database (Docker/Postgres 16).

```
Taskezy-ProjectV1 (Next.js, Netlify)  →  Taskezy-Server (this)  →  Taskezy_DB (Postgres 16, Docker)
        frontend                              API                        data
```

## Quick start

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL (use the taskezy_app role, not postgres), JWT secrets
npm run dev             # http://localhost:4000, hot-reloads on save
```

Verify it's alive: `curl http://localhost:4000/health`

## Architecture

Layered, one folder per feature under `src/modules/`:

```
routes  →  controller  →  service  →  repository  →  db pool
(HTTP)     (req/res)      (business    (SQL)          (pg.Pool)
                            logic,
                            authorization)
```

- **routes** wire up middleware (`requireAuth`, `validate`) and point at controllers. No logic here.
- **controller** pulls data off `req`, calls the service, shapes the response. No SQL, no business rules.
- **service** is where authorization/business rules live (e.g. `leads.service.ts`'s `scopeForCaller` — a sales team member only ever sees their own leads, re-checked server-side even though the old frontend already filtered this in the UI, because a UI filter is not security).
- **repository** is the only layer that writes SQL. Always parameterized (`$1`, `$2`, ...) — never string-concatenate a value into a query, no exceptions.

Two modules are fully built end-to-end as the reference pattern: `auth` and `leads`. Every other module (`properties`, `users`, `hrms`, `finance`, `notifications`, `calendar`, `reports`) follows the exact same four-file shape — see "Adding a new module" below.

## Security

| Concern | How it's handled |
|---|---|
| SQL injection | Every query is parameterized (`pg` placeholders). No template-string SQL anywhere in the codebase. |
| Password storage | bcrypt (12 rounds) via `bcryptjs`, compatible with the pgcrypto bcrypt hashes already seeded in the database. Plaintext passwords are never logged or stored. |
| Auth tokens | Short-lived JWT access token (15 min default) in the `Authorization: Bearer` header + a long-lived refresh token in an `httpOnly`, `sameSite=strict` cookie. Refresh tokens are stored server-side only as a SHA-256 hash (`refresh_tokens.token_hash`) and **rotate on every use** — a used refresh token is immediately revoked, so a leaked-but-already-used token is dead. |
| Authorization | `requireAuth` (valid token required) and `requireRole(...)` (role allowlist) middleware, plus per-module scoping logic in the service layer (see `leads.service.ts`). |
| Input validation | Every route validates `body`/`query`/`params` with a Zod schema (`middleware/validate.ts`) before touching the database. Malformed input never reaches SQL. |
| Least privilege | The server connects as `taskezy_app`, a Postgres role with `SELECT/INSERT/UPDATE/DELETE` only — no `DROP`/`ALTER`/superuser rights. See `Taskezy_DB/DATA_DICTIONARY.md` for how that role was created. |
| Transport | `helmet()` sets standard security headers. `cors()` only allows origins listed in `CORS_ALLOWED_ORIGINS`. |
| Abuse / brute force | `express-rate-limit`: 120 req/min general API limit, a much tighter 10 req/15min limit specifically on `/auth/*` (the endpoints actually worth rate-limiting for security, not just traffic shaping). |
| Error responses | Centralized `errorHandler` — deliberate errors (`ApiError`) return their message; anything unexpected is logged in full server-side but returns a generic message to the caller. Stack traces never leave the server. |
| Secrets | `.env` is gitignored (`.env.example` documents the shape, contains no real values). Config is validated at boot with Zod (`config/env.ts`) — a missing/short JWT secret crashes the server immediately on startup, not silently at the first request that needs it. |

## Data handling

- **Pagination everywhere a list can grow unbounded.** `GET /api/v1/leads` takes `page`/`pageSize` (capped at 100) and returns a `meta` block (`page`, `pageSize`, `totalCount`, `totalPages`). Never add a list endpoint that returns an un-paginated `SELECT *`.
- **Transactions for multi-table writes.** `leads.service.ts`'s `updateLeadStatus` updates `leads` *and* inserts into `lead_logs` inside one `withTransaction` — either both happen or neither does. Use `db/pool.ts`'s `withTransaction` for any write that touches more than one table.
- **Consistent response envelope.** Every success response is `{ success: true, data }` (or `{ success: true, data, meta }` for paginated lists); every error is `{ success: false, error: { code, message, details? } }`. Write the frontend's API client against this shape once, generically — you don't need bespoke handling per endpoint.

## Scaling & handling a lot of API traffic

The server is **stateless by design** — no in-memory session state, no server-side caching that would need synchronizing between instances. Everything that needs to persist lives in Postgres or in the JWT itself. That's what makes the rest of this section possible:

1. **Connection pooling, not per-request connections.** `db/pool.ts` opens one `pg.Pool` (default max 10 connections) at boot and every request borrows/returns a connection from it. This is the single biggest lever for handling many concurrent requests — opening a fresh TCP+auth handshake to Postgres per request would fall over under real load. Tune `DB_POOL_MAX` per instance so `(instances × DB_POOL_MAX) < Postgres's max_connections` (default 100).
2. **Horizontal scaling — run more than one instance.** Because there's no in-memory state, you can run N copies of this exact server (same `.env`, same image) behind a load balancer with zero code changes:
   - **Simplest:** most PaaS targets (Render, Railway, Fly.io) do this for you — set "instances: 2+" and they handle the load balancer.
   - **Self-managed:** `docker-compose` with `deploy.replicas: 3` behind an nginx or Caddy reverse proxy doing round-robin.
   - Either way, `/health` (checks real DB connectivity, not just "process is up") is what the load balancer should poll to decide whether an instance gets traffic.
3. **Graceful shutdown.** `server.ts` catches `SIGTERM`/`SIGINT`, stops accepting new connections, finishes in-flight requests, closes the DB pool, *then* exits. This matters specifically for load-balanced deployments — without it, a rolling deploy drops in-flight requests every time an old instance is killed.
4. **Rate limiting is per-instance today** (in-memory, via `express-rate-limit`'s default store). Fine at your current scale. If you scale to multiple instances behind a load balancer and want the rate limit to be *global* (not "N req/min per instance"), swap the store for `rate-limit-redis` — a five-line change, not a redesign, once you have Redis anyway (see next point).
5. **Caching — not built yet, but the architecture doesn't fight you adding it.** The service layer is the right place for a cache-aside pattern (`service` checks Redis → falls through to `repository` on miss → writes back). Nothing here needs restructuring to add that later; it's a purely additive change to whichever service function gets hot enough to need it. Don't add it before you've actually measured a bottleneck.

## Adding a new module

Follow the `leads` module as the template. For, say, `properties`:

1. `src/modules/properties/properties.schema.ts` — Zod schemas for list query params, create/update body.
2. `src/modules/properties/properties.repository.ts` — parameterized SQL against the `properties` / `property_team_members` tables (see `Taskezy_DB/DATA_DICTIONARY.md` section 3).
3. `src/modules/properties/properties.service.ts` — authorization + orchestration (e.g., only `ADMIN` can delete a property — use `requireRole("ADMIN")` at the route level for that one, or check `caller.role` inline for finer-grained rules).
4. `src/modules/properties/properties.controller.ts` — thin, calls the service, sends the response.
5. `src/modules/properties/properties.routes.ts` — wire `requireAuth` (+ `requireRole` where needed) and `validate` per route.
6. Mount it in `src/app.ts`: `app.use("/api/v1/properties", propertiesRouter);`

## Environment variables

See `.env.example` for the full list with descriptions. The important ones to get right per environment:

- `DATABASE_URL` — must point at the `taskezy_app` role, never `postgres`.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`, use **different** values for dev/staging/prod.
- `CORS_ALLOWED_ORIGINS` — must include your deployed Netlify URL in production, or the browser will block every request from the real frontend.

## Docker

```bash
docker build -t taskezy-server .
docker run -p 4000:4000 --env-file .env taskezy-server
```

Multi-stage build (`Dockerfile`) — the shipped image contains only compiled JS and production dependencies, no TypeScript source or dev tooling. Runs as a non-root user. Has a built-in `HEALTHCHECK` that hits `/health`, so `docker ps` and any orchestrator can see instance health without extra config.
