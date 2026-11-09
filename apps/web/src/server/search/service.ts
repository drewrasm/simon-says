import "server-only";

import { z } from "zod";
import {
  transcriptSegmentSchema,
  segmentDocumentId,
} from "@simon-says/contracts/caption";
import {
  searchRequestSchema,
  searchResponseSchema,
  type SearchResponse,
} from "@simon-says/contracts/search";
import { AccessError } from "../access/errors";
import { requireMembership } from "../access/membership";
import { requestElasticsearch } from "../evidence/elasticsearch";

const segmentSchema = transcriptSegmentSchema.safeExtend({
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
const sortSchema = z.tuple([
  z.number().finite(),
  z.string().min(1).max(200),
  z.number().int().positive(),
  z.number().int().positive(),
]);
const cursorSchema = z.object({
  mode: z.enum(["hybrid", "keyword"]),
  sort: sortSchema,
});
const hitSchema = z.object({ _source: segmentSchema, sort: sortSchema });
const responseSchema = z.object({
  timed_out: z.literal(false),
  _shards: z.object({ failed: z.literal(0) }),
  hits: z.object({
    total: z.object({
      value: z.number().int().nonnegative(),
      relation: z.literal("eq"),
    }),
    hits: z.array(z.unknown()),
  }),
});
const batchSchema = z.object({
  responses: z.tuple([z.unknown(), z.unknown(), z.unknown()]),
});
const unavailable: SearchResponse = {
  results: [],
  nextCursor: null,
  indexingState: "unavailable",
};
type SearchOptions = {
  sessionId: string;
  principalId: string;
  request: z.output<typeof searchRequestSchema>;
};

const decodeCursor = (cursor: string | undefined) => {
  if (!cursor) return null;
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "utf16le").toString("utf8")),
    );
  } catch {
    throw new AccessError(400, "invalid_request");
  }
};

export const searchSession = async ({
  sessionId,
  principalId,
  request,
}: SearchOptions): Promise<SearchResponse> => {
  await requireMembership({ sessionId, principalId });
  const cursor = decodeCursor(request.cursor);
  let result: SearchResponse;
  try {
    const sessionFilter = { term: { sessionId } };
    const expiryFilter = {
      bool: {
        should: [
          { bool: { must_not: { exists: { field: "expiresAt" } } } },
          { range: { expiresAt: { gt: "now" } } },
        ],
        minimum_should_match: 1,
      },
    };
    const keyword = { match: { text: request.query } };
    const page = (mode: "hybrid" | "keyword") => ({
      size: request.limit + 1,
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
      query: {
        bool: {
          filter: [sessionFilter, expiryFilter],
          should:
            mode === "hybrid"
              ? [
                  keyword,
                  {
                    semantic: { field: "text_semantic", query: request.query },
                  },
                ]
              : [keyword],
          minimum_should_match: 1,
        },
      },
      sort: [
        { _score: "desc" },
        { segmentId: "asc" },
        { epoch: "desc" },
        { revision: "desc" },
      ],
      ...(cursor?.mode === mode ? { search_after: cursor.sort } : {}),
    });
    const revisions = {
      size: 1001,
      collapse: { field: "segmentId" },
      _source: ["sessionId", "segmentId", "revision", "expiresAt"],
      track_total_hits: true,
      timeout: "1s",
      query: { bool: { filter: [sessionFilter] } },
      sort: [{ revision: "desc" }, { segmentId: "asc" }],
    };
    const batch = batchSchema.parse(
      await requestElasticsearch({
        path: "simon-says-segments/_msearch",
        contentType: "application/x-ndjson",
        signal: AbortSignal.timeout(3000),
        body: [
          cursor?.mode === "keyword"
            ? { size: 0, query: { match_none: {} } }
            : page("hybrid"),
          page("keyword"),
          revisions,
        ]
          .map(
            (body) =>
              `${JSON.stringify({ allow_partial_search_results: false })}\n${JSON.stringify(body)}\n`,
          )
          .join(""),
      }),
    );
    const [hybrid, lexical, revisionResult] = batch.responses;
    let mode: "hybrid" | "keyword" = cursor?.mode ?? "hybrid";
    const hybridPage = responseSchema.safeParse(hybrid);
    // Only the semantic clause differs, so any hybrid-only failure (missing or
    // unauthorized inference, timeout, shard failure) falls back to keyword.
    if (mode === "hybrid" && !hybridPage.success) {
      if (cursor) throw new Error("Search mode changed; restart pagination");
      mode = "keyword";
    }
    const ranked =
      mode === "hybrid" && hybridPage.success
        ? hybridPage.data
        : responseSchema.parse(lexical);
    const snapshot = responseSchema.parse(revisionResult);
    if (snapshot.hits.hits.length > 1000)
      throw new Error("Revision check truncated");
    const revisionSchema = z.object({
      sessionId: segmentSchema.shape.sessionId,
      segmentId: segmentSchema.shape.segmentId,
      revision: segmentSchema.shape.revision,
      expiresAt: segmentSchema.shape.expiresAt,
    });
    const latest = new Map<string, z.infer<typeof revisionSchema>>();
    for (const hit of snapshot.hits.hits) {
      const source = z.object({ _source: revisionSchema }).parse(hit)._source;
      if (source.sessionId !== sessionId)
        throw new Error("Invalid source session");
      if (source.revision > (latest.get(source.segmentId)?.revision ?? 0))
        latest.set(source.segmentId, source);
    }
    const hits = ranked.hits.hits.map((hit) => hitSchema.parse(hit));
    if (hits.some((hit) => hit._source.sessionId !== sessionId))
      throw new Error("Invalid source session");
    const scanned = hits.slice(0, request.limit);
    const now = Date.now();
    const results = scanned
      .filter(({ _source: source }) => {
        const current = latest.get(source.segmentId);
        return (
          current?.revision === source.revision &&
          (!current.expiresAt || Date.parse(current.expiresAt) > now) &&
          (!source.expiresAt || Date.parse(source.expiresAt) > now)
        );
      })
      .map(({ _source: source }) => ({
        passageId: segmentDocumentId(source),
        segmentId: source.segmentId,
        segmentRevision: source.revision,
        range: { startMs: source.startMs, endMs: source.endMs },
        excerpt: source.text,
      }));
    const last = scanned.at(-1);
    // Pack ASCII sort data under the shared 200-character opaque cursor limit.
    const nextCursor =
      hits.length > request.limit && last
        ? Buffer.from(`${JSON.stringify({ mode, sort: last.sort })} `).toString(
            "utf16le",
          )
        : null;
    result = searchResponseSchema.parse({
      results,
      nextCursor,
      indexingState: "current",
    });
  } catch {
    result = unavailable;
  }
  await requireMembership({ sessionId, principalId });
  return result;
};
