import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createDatabaseClient } from "../src/client";

config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const checkDatabase = async () => {
  const database = createDatabaseClient();

  try {
    await database.$queryRaw`SELECT 1`;
  } finally {
    await database.$disconnect();
  }
};

try {
  await checkDatabase();
  process.stdout.write("Prisma connected to PostgreSQL.\n");
} catch {
  process.stderr.write(
    "PostgreSQL connection check failed. Check DATABASE_URL and local services.\n",
  );
  process.exitCode = 1;
}
