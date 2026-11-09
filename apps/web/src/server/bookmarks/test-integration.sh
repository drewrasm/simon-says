#!/bin/sh
set -eu
: "${DATABASE_URL:?Set DATABASE_URL to a migrated local Postgres database}"
exec pnpm exec vitest run --config apps/web/src/server/bookmarks/vitest.integration.config.ts
