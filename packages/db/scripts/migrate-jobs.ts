import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Same root .env as prisma.config.ts; an exported DATABASE_URL still wins.
config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.stderr.write(
    "DATABASE_URL is required to migrate the pgboss schema.\n",
  );
  process.exit(1);
}

// The CLI reads the URL from its environment, so it never appears in the process list.
execFileSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/pg-boss/dist/cli.js", import.meta.url),
    ),
    "migrate",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, PGBOSS_DATABASE_URL: databaseUrl },
  },
);
