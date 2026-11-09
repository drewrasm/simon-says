import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./apps/web/src", import.meta.url).pathname,
      "server-only": new URL(
        "./apps/web/src/server/captions/server-only.test-stub.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: { include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"] },
});
