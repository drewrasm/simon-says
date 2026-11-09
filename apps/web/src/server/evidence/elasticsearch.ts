import "server-only";

import { z } from "zod";

const searchResponseSchema = z.object({
  timed_out: z.boolean(),
  _shards: z.object({ failed: z.number().int().nonnegative() }),
  hits: z.object({
    total: z.object({
      value: z.number().int().nonnegative(),
      relation: z.literal("eq"),
    }),
    hits: z.array(z.object({ _source: z.unknown() })),
  }),
});

type SearchOptions<T> = {
  index: "simon-says-segments";
  query: object;
  sort: object[];
  schema: z.ZodType<T>;
  signal: AbortSignal;
  latestOnly?: boolean;
};

type RequestOptions = {
  path: string;
  body: string;
  contentType: "application/json" | "application/x-ndjson";
  signal: AbortSignal;
};

export const requestElasticsearch = async ({
  path,
  body,
  contentType,
  signal,
}: RequestOptions): Promise<unknown> => {
  const origin = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  if (!origin || !apiKey) throw new Error("Evidence unavailable");

  const url = new URL(origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Evidence unavailable");

  const response = await fetch(`${url.origin}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${apiKey}`,
      "Content-Type": contentType,
    },
    body,
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (!response.ok) throw new Error("Evidence unavailable");
  const result: unknown = await response.json();
  return result;
};

export const searchSources = async <T>({
  index,
  query,
  sort,
  schema,
  signal,
  latestOnly = false,
}: SearchOptions<T>) => {
  const response = await requestElasticsearch({
    path: `${index}/_search?allow_partial_search_results=false`,
    contentType: "application/json",
    signal,
    body: JSON.stringify({
      size: latestOnly ? 1 : 1000,
      _source: [
        "sessionId",
        "epoch",
        "windowId",
        "segmentId",
        "revision",
        "startMs",
        "endMs",
        "timing",
        "text",
        "provenance",
        "expiresAt",
      ],
      track_total_hits: true,
      timeout: "1s",
      query,
      sort,
    }),
  });
  const result = searchResponseSchema.parse(response);
  if (
    result.timed_out ||
    result._shards.failed ||
    (!latestOnly && result.hits.total.value > result.hits.hits.length)
  )
    throw new Error("Evidence unavailable");
  return result.hits.hits.map((hit) => schema.parse(hit._source));
};
