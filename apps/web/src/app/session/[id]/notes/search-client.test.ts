import { putBookmarkRequestSchema } from "@simon-says/contracts/bookmark";
import { describe, expect, it } from "vitest";
import { searchResultAnchor, searchSession } from "./search-client";

const sessionId = "6f1c1f7e-3d0e-4c1e-9a7a-2f5b8c6d9e01";
const result = {
  passageId: "seg-4:2",
  segmentId: "seg-4",
  segmentRevision: 2,
  range: { startMs: 61_000, endMs: 66_500 },
  excerpt: "Latency budgets belong to the whole pipeline.",
};

describe("searchSession", () => {
  it("posts the query and returns the parsed results", async () => {
    const sent: { url: string; body: unknown }[] = [];
    const response = {
      results: [result],
      nextCursor: null,
      indexingState: "catching_up",
    };
    const found = await searchSession(sessionId, "latency", (async (
      url: string,
      init: RequestInit,
    ) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json(response);
    }) as typeof fetch);

    expect(found).toEqual({ kind: "ok", response });
    expect(sent).toEqual([
      { url: `/api/sessions/${sessionId}/search`, body: { query: "latency" } },
    ]);
  });

  it("reports a failed, malformed, or unreachable response as an error", async () => {
    const failing = (async () =>
      Response.json(
        { error: "internal_error" },
        { status: 500 },
      )) as typeof fetch;
    const malformed = (async () =>
      Response.json({ results: "none" })) as typeof fetch;
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    expect(await searchSession(sessionId, "latency", failing)).toEqual({
      kind: "error",
    });
    expect(await searchSession(sessionId, "latency", malformed)).toEqual({
      kind: "error",
    });
    expect(await searchSession(sessionId, "latency", offline)).toEqual({
      kind: "error",
    });
  });
});

describe("searchResultAnchor", () => {
  it("saves the found passage with its segment revision and timestamps", () => {
    const anchor = searchResultAnchor(result);

    expect(anchor).toEqual({
      kind: "paragraph",
      segmentId: "seg-4",
      segmentRevision: 2,
      range: { startMs: 61_000, endMs: 66_500 },
    });
    expect(
      putBookmarkRequestSchema.safeParse({
        sessionId,
        operationId: "00000000-0000-4000-8000-000000000001",
        expectedRevision: null,
        anchor,
      }).success,
    ).toBe(true);
  });
});
