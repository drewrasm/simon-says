import "server-only";
import { Client } from "@elastic/elasticsearch";

export type ElasticsearchConfig = { node: string; apiKey: string };
let client: Client | undefined;

/** Construct only on first use; transport retries belong to the sink's total budget. */
export function elasticsearchClient(config: ElasticsearchConfig): Client {
  return (client ??= new Client({
    node: config.node,
    auth: { apiKey: config.apiKey },
    requestTimeout: 1000,
    maxRetries: 0,
  }));
}
