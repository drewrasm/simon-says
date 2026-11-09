import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { settings: { next: { rootDir: "apps/web/" } } },
  globalIgnores([
    "**/.next/**",
    "**/dist/**",
    "**/next-env.d.ts",
    "**/generated/**",
  ]),
  {
    files: ["packages/{ui,domain,contracts}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@simon-says/db",
            "@simon-says/db/*",
            "@prisma/*",
            "@deepgram/*",
            "pg",
          ],
        },
      ],
    },
  },
]);
