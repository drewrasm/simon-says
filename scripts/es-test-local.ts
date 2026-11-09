import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

// Deliberately ignore ambient/cloud Elasticsearch credentials.
const local = parseEnv(
  await readFile(`${homedir()}/simon-says-elastic-local/.env`, "utf8"),
);
local.ES_LOCAL_URL = local.ES_LOCAL_URL?.replace(
  "${ES_LOCAL_PORT}",
  local.ES_LOCAL_PORT ?? "",
);
if (local.ES_LOCAL_URL !== "http://localhost:9200" || !local.ES_LOCAL_API_KEY)
  throw new Error(
    "Expected local ES_LOCAL_URL=http://localhost:9200 and ES_LOCAL_API_KEY.",
  );
const env = {
  ...process.env,
  ELASTICSEARCH_URL: local.ES_LOCAL_URL,
  ELASTICSEARCH_API_KEY: local.ES_LOCAL_API_KEY,
  ELASTICSEARCH_INFERENCE_ID: ".multilingual-e5-small-elasticsearch",
  ES_LOCAL_INTEGRATION: "1",
};
try {
  await fetch(local.ES_LOCAL_URL, {
    headers: { Authorization: `ApiKey ${local.ES_LOCAL_API_KEY}` },
    signal: AbortSignal.timeout(1000),
  });
} catch {
  console.log(
    "SKIP: local Elasticsearch unreachable at http://localhost:9200; run cd ~/simon-says-elastic-local && ./start.sh",
  );
  process.exit(0);
}
for (const args of [
  ["es:setup"],
  [
    "exec",
    "vitest",
    "run",
    "apps/web/src/server/search/elasticsearch.integration.test.ts",
  ],
]) {
  const result = spawnSync("pnpm", args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
