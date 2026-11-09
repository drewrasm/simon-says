import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export const createDatabaseClient = () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  try {
    const url = new URL(connectionString);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("Invalid protocol.");
    }
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  return new PrismaClient({ adapter });
};
