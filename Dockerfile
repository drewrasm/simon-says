# syntax=docker/dockerfile:1
FROM node:22.22.0-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# Explicit production dependency closure, including the compiled custom server.
# Standalone tracing does not package custom servers. Prisma is generated above;
# the access routes use its client.
# The database closure (Prisma CLI and migrations) backs the Argo CD migration Job.
RUN pnpm --filter @simon-says/web deploy --prod --legacy /runtime \
    && pnpm --filter @simon-says/db deploy --prod --legacy /runtime/migrate \
    && rm -rf apps/web/.next/cache \
    && cp -R apps/web/.next /runtime/.next

FROM node:22.22.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8080 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=1000:1000 /runtime/ ./
USER 1000:1000
EXPOSE 8080
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
