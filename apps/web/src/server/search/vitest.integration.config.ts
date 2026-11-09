import { defineConfig } from "vitest/config";

if (!process.env.DATABASE_URL)
  throw new Error(
    "Search integration tests require DATABASE_URL and migrated local Postgres",
  );

export default defineConfig({
  test: {
    include: ["apps/web/src/server/search/service.integration.ts"],
    fileParallelism: false,
  },
});
