import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchResponseSchema } from "@simon-says/contracts/search";
import { searchSession } from "./service";
import { recordAcknowledgedSegments } from "./indexing-lag";
import { searchBatch, searchHit, searchPage } from "./fixtures";
import { syntheticSegment } from "../evidence/fixtures";

vi.mock("server-only", () => ({}));
const { membership } = vi.hoisted(() => ({
  membership: { findUnique: vi.fn() },
}));
vi.mock("../access/database", () => ({ getDatabase: () => ({ membership }) }));
const fetchMock = vi.fn<typeof fetch>();
const sessionId = randomUUID();
const principalId = randomUUID();
const options = {
  sessionId,
  principalId,
  request: { query: "earlier idea", limit: 10 },
};
const source = syntheticSegment({ sessionId });
const member = { revokedAt: null, session: { status: "live" } };
const bodies = () => {
  const init = fetchMock.mock.calls.at(-1)?.[1];
  return String(init?.body)
    .trim()
    .split("\n")
    .map((line: string): unknown => JSON.parse(line));
};

beforeEach(() => {
  globalThis.simonSaysUnsearchedSegments = undefined;
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ELASTICSEARCH_URL", "https://synthetic-elastic.example");
  vi.stubEnv("ELASTICSEARCH_API_KEY", "synthetic-key");
  membership.findUnique.mockResolvedValue(member);
  fetchMock.mockResolvedValue(Response.json(searchBatch([searchHit(source)])));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("session search with synthetic ES HTTP fixtures", () => {
  it("uses one bounded hybrid batch, session/expiry filters and an unfiltered revision check", async () => {
    const result = await searchSession(options);
    expect(searchResponseSchema.parse(result)).toEqual({
      results: [
        {
          passageId: `${sessionId}:1:segment-1:1`,
          segmentId: "segment-1",
          segmentRevision: 1,
          range: { startMs: 0, endMs: 30000 },
          excerpt: source.text,
        },
      ],
      nextCursor: null,
      indexingState: "current",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://synthetic-elastic.example/simon-says-segments/_msearch",
      expect.objectContaining({ cache: "no-store", redirect: "error" }),
    );
    expect(bodies()[1]).toMatchObject({
      size: 11,
      query: {
        bool: {
          filter: [
            { term: { sessionId } },
            {
              bool: {
                should: [
                  { bool: { must_not: { exists: { field: "expiresAt" } } } },
                  { range: { expiresAt: { gt: "now" } } },
                ],
              },
            },
          ],
          should: [
            { match: { text: "earlier idea" } },
            { semantic: { field: "text_semantic", query: "earlier idea" } },
          ],
          minimum_should_match: 1,
        },
      },
    });
    expect(bodies()[5]).toMatchObject({
      size: 1001,
      collapse: { field: "segmentId" },
      query: { bool: { filter: [{ term: { sessionId } }] } },
      sort: [{ revision: "desc" }, { segmentId: "asc" }],
    });
    expect(membership.findUnique).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    { ...member, revokedAt: new Date() },
    { revokedAt: null, session: { status: "expired" } },
  ])(
    "denies missing/revoked/expired membership before ES",
    async (membershipValue) => {
      membership.findUnique.mockResolvedValue(membershipValue);
      await expect(searchSession(options)).rejects.toMatchObject({
        status: 404,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("reports catching_up with results until an acknowledged segment is searchable", async () => {
    const pending = syntheticSegment({ sessionId, segmentId: "segment-2" });
    recordAcknowledgedSegments([pending]);

    const lagging = await searchSession(options);
    expect(lagging.indexingState).toBe("catching_up");
    expect(lagging.results.map((result) => result.segmentId)).toEqual([
      "segment-1",
    ]);

    fetchMock.mockResolvedValue(
      Response.json(
        searchBatch(
          [searchHit(source)],
          [searchHit(source), searchHit(pending)],
        ),
      ),
    );
    expect((await searchSession(options)).indexingState).toBe("current");

    fetchMock.mockResolvedValue(
      Response.json(searchBatch([searchHit(source)])),
    );
    expect((await searchSession(options)).indexingState).toBe("current");
  });

  it("reports catching_up while only an older revision is searchable", async () => {
    recordAcknowledgedSegments([syntheticSegment({ sessionId, revision: 2 })]);

    expect((await searchSession(options)).indexingState).toBe("catching_up");
  });

  it("ignores acknowledged segments from other sessions", async () => {
    recordAcknowledgedSegments([
      syntheticSegment({ sessionId: randomUUID(), segmentId: "segment-2" }),
    ]);

    expect((await searchSession(options)).indexingState).toBe("current");
  });

  it("keeps failures unavailable while segments are pending", async () => {
    recordAcknowledgedSegments([
      syntheticSegment({ sessionId, segmentId: "segment-2" }),
    ]);
    fetchMock.mockRejectedValue(new Error("synthetic outage"));

    expect(await searchSession(options)).toEqual({
      results: [],
      nextCursor: null,
      indexingState: "unavailable",
    });
  });

  it("revalidates membership after search, including unavailable results", async () => {
    membership.findUnique
      .mockResolvedValueOnce(member)
      .mockResolvedValueOnce(null);
    await expect(searchSession(options)).rejects.toMatchObject({ status: 404 });
    membership.findUnique
      .mockResolvedValueOnce(member)
      .mockResolvedValueOnce(null);
    fetchMock.mockRejectedValueOnce(new Error("Synthetic outage"));
    await expect(searchSession(options)).rejects.toMatchObject({ status: 404 });
  });

  it("never resurrects an older matching revision when the correction no longer matches or has expired", async () => {
    const latest = {
      ...source,
      revision: 2,
      text: "Unrelated correction",
      expiresAt: "2000-01-01T00:00:00.000Z",
    };
    fetchMock.mockResolvedValueOnce(
      Response.json(
        searchBatch(
          [searchHit(source)],
          [searchHit(source), searchHit(latest)],
        ),
      ),
    );
    expect(await searchSession(options)).toMatchObject({
      results: [],
      indexingState: "current",
    });
  });

  it("accepts a complete collapsed revision check even when total counts older revisions", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        responses: [
          searchPage([searchHit(source)]),
          searchPage([]),
          searchPage([searchHit(source)], 10000),
        ],
      }),
    );
    expect(await searchSession(options)).toMatchObject({
      indexingState: "current",
      results: [{ segmentId: source.segmentId }],
    });
  });

  it("discards expired sources even when the boundary returns them", async () => {
    const expired = { ...source, expiresAt: "2000-01-01T00:00:00.000Z" };
    fetchMock.mockResolvedValueOnce(
      Response.json(searchBatch([searchHit(expired)])),
    );
    expect(await searchSession(options)).toMatchObject({
      results: [],
      indexingState: "current",
    });
  });

  it("uses keyword results if the semantic endpoint is missing or unauthorized", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        searchBatch([searchHit(source)], undefined, {
          status: 403,
          error: {
            type: "inference_exception",
            reason: "Synthetic endpoint unauthorized",
          },
        }),
      ),
    );
    expect(await searchSession(options)).toMatchObject({
      results: [{ excerpt: source.text }],
      indexingState: "current",
    });
  });

  it("uses keyword results if the semantic clause times out or fails shards", async () => {
    for (const hybrid of [
      { ...searchPage([]), timed_out: true },
      { ...searchPage([]), _shards: { failed: 1 } },
    ]) {
      fetchMock.mockResolvedValueOnce(
        Response.json(searchBatch([searchHit(source)], undefined, hybrid)),
      );
      expect(await searchSession(options)).toMatchObject({
        results: [{ excerpt: source.text }],
        indexingState: "current",
      });
    }
  });

  it("round-trips opaque search_after cursors and keeps keyword pagination in keyword mode", async () => {
    const second = syntheticSegment({ sessionId, segmentId: "segment-2" });
    const hits = [searchHit(source, 2), searchHit(second, 1)];
    fetchMock.mockResolvedValueOnce(
      Response.json(
        searchBatch(hits, undefined, {
          error: { type: "inference_exception" },
          status: 404,
        }),
      ),
    );
    const first = await searchSession({
      ...options,
      request: { ...options.request, limit: 1 },
    });
    expect(first.nextCursor).toBeTypeOf("string");
    fetchMock.mockResolvedValueOnce(
      Response.json(searchBatch([hits[1]!], hits)),
    );
    const next = await searchSession({
      ...options,
      request: { ...options.request, limit: 1, cursor: first.nextCursor! },
    });
    expect(next.results[0]?.segmentId).toBe("segment-2");
    expect(bodies()[3]).toMatchObject({ search_after: [2, "segment-1", 1, 1] });
    expect(bodies()[1]).not.toHaveProperty("search_after");
  });

  it("keeps cursors within the shared bound even with 200-character segment IDs", async () => {
    const longIdSource = syntheticSegment({
      sessionId,
      segmentId: "a".repeat(200),
    });
    const hits = [searchHit(longIdSource, 2), searchHit(source, 1)];
    fetchMock.mockResolvedValueOnce(Response.json(searchBatch(hits)));
    const first = await searchSession({
      ...options,
      request: { ...options.request, limit: 1 },
    });
    const cursor = first.nextCursor;
    expect(cursor).toBeTypeOf("string");
    if (!cursor) throw new Error("Expected next cursor");
    expect(cursor.length).toBeLessThanOrEqual(200);
    const transported: unknown = JSON.parse(JSON.stringify(cursor));
    expect(transported).toBe(cursor);
    fetchMock.mockResolvedValueOnce(
      Response.json(searchBatch([hits[1]!], hits)),
    );
    await searchSession({
      ...options,
      request: { ...options.request, limit: 1, cursor },
    });
    expect(bodies()[1]).toMatchObject({
      search_after: [2, longIdSource.segmentId, 1, 1],
    });
  });

  it("rejects malformed cursor before querying ES", async () => {
    await expect(
      searchSession({
        ...options,
        request: { ...options.request, cursor: "%%%" },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "outage",
    "missing-config",
    "invalid-response",
    "partial",
    "truncated",
    "wrong-session",
    "other-error",
  ])(
    "returns unavailable, never authoritative emptiness: %s",
    async (scenario) => {
      if (scenario === "outage")
        fetchMock.mockRejectedValueOnce(new Error("Synthetic outage"));
      if (scenario === "missing-config")
        vi.stubEnv("ELASTICSEARCH_API_KEY", "");
      if (scenario === "invalid-response")
        fetchMock.mockResolvedValueOnce(Response.json({}));
      if (scenario === "partial")
        fetchMock.mockResolvedValueOnce(
          Response.json({
            responses: [
              { ...searchPage([]), timed_out: true },
              { ...searchPage([]), timed_out: true },
              searchPage([]),
            ],
          }),
        );
      if (scenario === "truncated")
        fetchMock.mockResolvedValueOnce(
          Response.json({
            responses: [
              searchPage([]),
              searchPage([]),
              searchPage(
                Array.from({ length: 1001 }, (_, i) =>
                  searchHit(
                    syntheticSegment({ sessionId, segmentId: `segment-${i}` }),
                  ),
                ),
              ),
            ],
          }),
        );
      if (scenario === "wrong-session")
        fetchMock.mockResolvedValueOnce(
          Response.json(searchBatch([searchHit(syntheticSegment())])),
        );
      if (scenario === "other-error")
        fetchMock.mockResolvedValueOnce(
          Response.json({
            responses: Array.from({ length: 3 }, () => ({
              error: { type: "index_not_found_exception" },
              status: 404,
            })),
          }),
        );
      expect(await searchSession(options)).toEqual({
        results: [],
        nextCursor: null,
        indexingState: "unavailable",
      });
    },
  );
});
