import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import type { Client, estypes } from "@elastic/elasticsearch";
import {
  elasticClient,
  elasticConfig,
  indexDefinitions,
  reportFailure,
} from "./es-config";

/** Remove only server-generated semantic metadata; all declared fields/options still compare exactly. */
function comparableMapping(mapping: estypes.MappingTypeMapping) {
  const copy = structuredClone(mapping);
  for (const field of Object.values(copy.properties ?? {})) {
    if ("properties" in field && !field.type) field.type = "object";
    if (field.type === "semantic_text") {
      if ("model_settings" in field) delete field.model_settings;
    }
    // Elasticsearch serializes a single copy_to target as an array.
    if ("copy_to" in field && typeof field.copy_to === "string")
      field.copy_to = [field.copy_to];
  }
  return copy;
}

/** Inspect everything before writing; mapping drift never triggers a put-mapping or alias change. */
export async function setupIndices(
  client: Client,
  inferenceId: string,
  dryRun: boolean,
) {
  const definitions = await indexDefinitions(inferenceId);
  const missing: typeof definitions = [];
  const actions: estypes.IndicesUpdateAliasesAction[] = [];
  for (const definition of definitions) {
    if (await client.indices.exists({ index: definition.index })) {
      const existing = await client.indices.getMapping({
        index: definition.index,
      });
      const actual = existing[definition.index];
      if (
        !actual ||
        !isDeepStrictEqual(
          comparableMapping(actual.mappings),
          comparableMapping(definition.mappings),
        )
      ) {
        throw new Error(
          `Mapping drift in ${definition.index}; review mappings and reindex to a new version. No mappings or aliases were changed.`,
        );
      }
      console.log(`Mapping verified: ${definition.index}`);
    } else {
      missing.push(definition);
      console.log(
        `${dryRun ? "Would create" : "Plan create"}: ${definition.index}`,
      );
    }
    const aliases = (await client.indices.existsAlias({
      name: definition.alias,
    }))
      ? await client.indices.getAlias({ name: definition.alias })
      : {};
    const current = aliases[definition.index]?.aliases[definition.alias];
    if (
      Object.keys(aliases).length === 1 &&
      isDeepStrictEqual(current, { is_write_index: true })
    ) {
      console.log(
        `Alias verified: ${definition.alias} -> ${definition.index} (write)`,
      );
    } else {
      for (const index of Object.keys(aliases))
        actions.push({ remove: { index, alias: definition.alias } });
      actions.push({
        add: {
          index: definition.index,
          alias: definition.alias,
          is_write_index: true,
        },
      });
      console.log(
        `${dryRun ? "Would repair" : "Plan repair"}: ${definition.alias} -> ${definition.index} (write)`,
      );
    }
  }
  if (dryRun) {
    console.log("Dry run: no writes performed");
    return;
  }
  for (const definition of missing) {
    await client.indices.create({
      index: definition.index,
      mappings: definition.mappings,
    });
    console.log(`Created: ${definition.index}`);
  }
  if (actions.length) {
    await client.indices.updateAliases({ actions });
    console.log("Aliases repaired atomically");
  }
  console.log("Setup complete");
}

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== "--dry-run"))
    throw new Error("Usage: pnpm es:setup [--dry-run]");
  const config = elasticConfig();
  const client = elasticClient(config);
  try {
    console.log(`Inference endpoint: ${config.inferenceId}`);
    await setupIndices(
      client,
      config.inferenceId,
      process.argv.includes("--dry-run"),
    );
  } finally {
    await client.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(reportFailure);
}
