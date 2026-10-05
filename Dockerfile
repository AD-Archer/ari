# syntax=docker/dockerfile:1.7

# "public" builds the open core. "private" needs the private repository checked out at private/
# and handed over as its own context: --build-context privateweb=private/web
ARG edition=public

FROM scratch AS code-public

FROM scratch AS code-private
COPY --from=privateweb . /web

FROM code-${edition} AS code

FROM oven/bun:1 AS build
ARG edition
WORKDIR /app

# lockfile-only install first so a source-only change reuses this layer
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# .dockerignore keeps private/ out of this context, so the private code can only arrive from the stage above
COPY . .
COPY --from=code / ./private/

# sync must run before prisma generate: it writes the .svelte-kit/tsconfig.json the generator reads.
# generate never connects, but prisma.config.ts needs DATABASE_URL present
RUN set -e; \
    if [ "$edition" = private ]; then \
      test -f private/web/index.ts || { echo "private/web is not in the privateweb context"; exit 1; }; \
    else \
      export ARI_PUBLIC_BUILD=1; \
    fi; \
    export DATABASE_URL=postgresql://build:build@localhost:5432/build; \
    bunx svelte-kit sync; \
    bunx prisma generate; \
    bun run build

FROM node:22-slim AS runtime
WORKDIR /app

# behind a proxy: trust forwarded headers so adapter-node sees the real origin (csrf, redirects)
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PROTOCOL_HEADER=x-forwarded-proto \
    HOST_HEADER=x-forwarded-host \
    ADDRESS_HEADER=x-forwarded-for

# without openssl prisma cannot tell which schema engine fits and tries to download another at start
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

# /login is public and cheap; node's fetch avoids needing curl in the slim image
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# SKIP_DB_MIGRATE=1 starts without migrating; timeout caps a lock-waiting migration
COPY <<'EOF' /usr/local/bin/entrypoint.sh
#!/bin/sh
set -e
if [ "$SKIP_DB_MIGRATE" != "1" ]; then
  echo "[entrypoint] prisma migrate deploy (max 120s)..."
  if ! timeout 120s ./node_modules/.bin/prisma migrate deploy; then
    echo "[entrypoint] migration failed or timed out; exiting"
    exit 1
  fi
  echo "[entrypoint] migrations applied"
else
  echo "[entrypoint] SKIP_DB_MIGRATE=1 set; skipping migrations"
fi
echo "[entrypoint] starting server on :${PORT}"
exec node build
EOF
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node
CMD ["/usr/local/bin/entrypoint.sh"]
