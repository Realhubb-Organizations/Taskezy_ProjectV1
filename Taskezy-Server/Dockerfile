# Multi-stage build: compile TypeScript in a full Node image, run the
# compiled JS in a minimal one — the final image never contains dev
# dependencies, TypeScript source, or the compiler itself.

FROM node:20-alpine AS build
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
RUN npm run build

FROM node:20-alpine AS runtime
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
