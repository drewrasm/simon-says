import "server-only";

import { createDatabaseClient } from "@simon-says/db/client";

declare global {
  var simonSaysAccessDatabase:
    ReturnType<typeof createDatabaseClient> | undefined;
}

export const getDatabase = () => {
  globalThis.simonSaysAccessDatabase ??= createDatabaseClient();
  return globalThis.simonSaysAccessDatabase;
};
