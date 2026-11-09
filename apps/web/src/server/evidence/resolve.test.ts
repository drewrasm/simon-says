import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestedRange, resolveEvidence } from "./resolve";
import { syntheticSearchResponse, syntheticSegment } from "./fixtures";

vi.mock("server-only", () => ({}));
const fetchMock = vi.fn<typeof fetch>();
const range = { startMs: 5000, endMs: 35_000 };
const sessionId = "synthetic-session";

type ServeOptions = {
  segments?: ReturnType<typeof syntheticSegment>[];
  revisions?: ReturnType<typeof syntheticSegment>[];
};

const serve = ({
  segments = [syntheticSegment({ endMs: 40_000 })],
  revisions = segments,
}: ServeOptions = {}) => {
  fetchMock.mockImplementation(async (_url, init) => {
    const body = String(init?.body);
    const sources = body.includes('"terms"') ? revisions : segments;
    return Response.json(syntheticSearchResponse(sources));
  });
};

beforeEach(() => {
  vi.stubEnv("ELASTICSEARCH_URL", "https://synthetic-elastic.example");
  vi.stubEnv("ELASTICSEARCH_API_KEY", "synthetic-test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  serve();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bookmark range resolution (synthetic Elasticsearch HTTP)", () => {
  it("clamps live marks to the session start and preserves paragraph ranges", () => {
    expect(requestedRange({ kind: "live", markedAtMs: 2000 })).toEqual({
      startMs: 0,
      endMs: 2000,
    });
    expect(requestedRange({ kind: "live", markedAtMs: 60_000 })).toEqual({
      startMs: 30_000,
      endMs: 60_000,
    });
    expect(
      requestedRange({
        kind: "paragraph",
        segmentId: "s",
        segmentRevision: 2,
        range,
      }),
    ).toEqual(range);
  });

  it("keeps a zero-width selection pending without claiming transcript coverage", async () => {
    expect(
      await resolveEvidence({
        sessionId,
        range: { startMs: 5000, endMs: 5000 },
      }),
    ).toMatchObject({ completeness: "pending", actualRange: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects the latest revision inside the range", async () => {
    serve({
      segments: [
        syntheticSegment({ endMs: 40_000 }),
        syntheticSegment({
          revision: 3,
          endMs: 40_000,
          text: "Synthetic correction.",
        }),
      ],
    });
    const result = await resolveEvidence({ sessionId, range });
    expect(result).toMatchObject({
      completeness: "complete",
      actualRange: range,
      clockUncertaintyMs: 1500,
      evidence: {
        segments: [
          {
            segmentId: "segment-1",
            revision: 3,
            text: "Synthetic correction.",
          },
        ],
      },
    });
    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      body: JSON.parse(String(init?.body)),
      cache: init?.cache,
    }));
    expect(calls[0]).toMatchObject({
      url: expect.stringContaining("simon-says-segments/_search"),
      cache: "no-store",
      body: {
        query: {
          bool: {
            filter: [
              { term: { sessionId } },
              { range: { startMs: { lt: 35_000 } } },
              { range: { endMs: { gt: 5000 } } },
            ],
          },
        },
      },
    });
  });

  it("does not resurrect an older revision when a correction moves outside the range", async () => {
    serve({
      segments: [syntheticSegment()],
      revisions: [
        syntheticSegment(),
        syntheticSegment({ revision: 2, startMs: 40_000, endMs: 50_000 }),
      ],
    });
    expect(
      (await resolveEvidence({ sessionId, range })).evidence.segments,
    ).toEqual([]);
  });

  it("keeps gaps incomplete even when the outer bounds span the requested range", async () => {
    serve({
      segments: [
        syntheticSegment({ endMs: 10_000 }),
        syntheticSegment({
          segmentId: "segment-2",
          startMs: 20_000,
          endMs: 40_000,
        }),
      ],
    });
    expect(await resolveEvidence({ sessionId, range })).toMatchObject({
      completeness: "incomplete",
      actualRange: range,
    });
  });

  it("clips actual bounds while preserving source passage ranges", async () => {
    serve({ segments: [syntheticSegment({ startMs: 10_000, endMs: 40_000 })] });
    expect(await resolveEvidence({ sessionId, range })).toMatchObject({
      completeness: "incomplete",
      actualRange: { startMs: 10_000, endMs: 35_000 },
      evidence: { segments: [{ range: { startMs: 10_000, endMs: 40_000 } }] },
    });
  });

  it("rejects expired source revisions", async () => {
    const expired = {
      ...syntheticSegment({ revision: 2 }),
      expiresAt: "2000-01-01T00:00:00.000Z",
    };
    serve({
      segments: [syntheticSegment(), expired],
    });
    expect(await resolveEvidence({ sessionId, range })).toMatchObject({
      completeness: "pending",
      actualRange: null,
      evidence: { segments: [] },
    });
  });

  it("accepts offset expiry timestamps", async () => {
    serve({
      segments: [
        {
          ...syntheticSegment({ endMs: 40_000 }),
          expiresAt: "2099-01-01T00:00:00+00:00",
        },
      ],
    });
    expect(await resolveEvidence({ sessionId, range })).toMatchObject({
      completeness: "complete",
      evidence: {
        segments: [{ segmentId: "segment-1" }],
      },
    });
  });

  it("keeps unindexed ranges pending", async () => {
    serve({ segments: [] });
    expect((await resolveEvidence({ sessionId, range })).completeness).toBe(
      "pending",
    );
  });

  it.each([
    "network",
    "http",
    "timeout",
    "shards",
    "truncated",
    "invalid",
    "wrong-session",
  ])("returns pending on %s failures", async (failure) => {
    fetchMock.mockImplementation(async () => {
      if (failure === "network") throw new Error("Synthetic private error");
      if (failure === "http") return new Response(null, { status: 503 });
      const response = syntheticSearchResponse([syntheticSegment()]);
      if (failure === "timeout") response.timed_out = true;
      if (failure === "shards") response._shards.failed = 1;
      if (failure === "truncated") response.hits.total.value = 1001;
      if (failure === "invalid") return Response.json({ invalid: true });
      if (failure === "wrong-session")
        return Response.json(
          syntheticSearchResponse([
            syntheticSegment({ sessionId: "other-session" }),
          ]),
        );
      return Response.json(response);
    });
    expect(await resolveEvidence({ sessionId, range })).toMatchObject({
      completeness: "pending",
      evidence: { segments: [] },
    });
  });

  it("does not issue requests when ES is unconfigured or its origin is invalid", async () => {
    vi.stubEnv("ELASTICSEARCH_API_KEY", "");
    expect((await resolveEvidence({ sessionId, range })).completeness).toBe(
      "pending",
    );
    vi.stubEnv("ELASTICSEARCH_API_KEY", "synthetic-test-key");
    vi.stubEnv("ELASTICSEARCH_URL", "https://user:password@example.com/");
    expect((await resolveEvidence({ sessionId, range })).completeness).toBe(
      "pending",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
