import { readFile } from "node:fs/promises";
import { Client, errors } from "@elastic/elasticsearch";
import type { estypes } from "@elastic/elasticsearch";

export function elasticConfig() {
  const node = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  if (!node || !apiKey) {
    throw new Error("Set ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY");
  }
  const url = new URL(node);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "ELASTICSEARCH_URL must be an HTTP(S) origin without credentials",
    );
  }
  const inferenceId =
    process.env.ELASTICSEARCH_INFERENCE_ID ?? ".jina-embeddings-v5-text-small";
  if (!inferenceId.trim())
    throw new Error("ELASTICSEARCH_INFERENCE_ID cannot be empty");
  return { node: url.origin, apiKey, inferenceId };
}

export function elasticClient(config: ReturnType<typeof elasticConfig>) {
  return new Client({
    node: config.node,
    auth: { apiKey: config.apiKey },
    requestTimeout: 180_000,
    maxRetries: 0,
  });
}

export async function indexDefinitions(inferenceId: string) {
  return Promise.all(
    ["segments", "observations"].map(async (name) => {
      // Repository-owned JSON, never user input; the client validates the mapping at creation.
      const definition: estypes.IndicesCreateRequest = JSON.parse(
        await readFile(
          new URL(`../infra/elasticsearch/${name}-v1.json`, import.meta.url),
          "utf8",
        ),
      );
      if (!definition.mappings) throw new Error(`Missing mapping for ${name}`);
      const semantic = definition.mappings.properties?.text_semantic;
      if (semantic && semantic.type === "semantic_text")
        semantic.inference_id = inferenceId;
      return {
        index: `${name}-v1`,
        alias: `simon-says-${name}`,
        mappings: definition.mappings,
      };
    }),
  );
}

/** Report only error types/status; client errors can contain credentials and source content. */
export function reportFailure(error: unknown) {
  if (error instanceof errors.ResponseError) {
    console.error(
      `Elasticsearch request failed: HTTP ${error.statusCode}, ${error.body?.error?.type ?? "unknown_error"}`,
    );
  } else if (error instanceof errors.ElasticsearchClientError) {
    console.error(`Elasticsearch connection failed: ${error.name}`);
  } else {
    console.error(
      error instanceof Error ? error.message : "Elasticsearch operation failed",
    );
  }
  process.exitCode = 1;
}
