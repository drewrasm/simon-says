import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { describe, expect, it } from "vitest";
import { createRecap, getRecap, recapSelection } from "./recap-client";

const sessionId = "6f1c1f7e-3d0e-4c1e-9a7a-2f5b8c6d9e01";
const recapId = "00000000-0000-4000-8000-000000000009";
const operationId = "00000000-0000-4000-8000-000000000001";

const bookmark = (n: number, captioned: boolean): BookmarkResponse => ({
  id: `00000000-0000-4000-8000-00000000001${n}`,
  sessionId,
  revision: n,
  anchor: { kind: "live", markedAtMs: 5_000 },
  requestedRange: { startMs: 0, endMs: 5_000 },
  actualRange: null,
  clockUncertaintyMs: 0,
  completeness: captioned ? "complete" : "pending",
  evidence: {
    segments: captioned
      ? [
          {
            segmentId: `seg-${n}`,
            revision: 1,
            range: { startMs: 0, endMs: 5_000 },
            text: "Said aloud.",
          },
        ]
      : [],
    frames: [],
  },
  note: null,
  createdAt: "2026-11-09T20:13:24.000Z",
  updatedAt: "2026-11-09T20:13:24.000Z",
});

const respondWith = (status: number, body?: unknown) =>
  (async () => Response.json(body ?? {}, { status })) as typeof fetch;

describe("recapSelection", () => {
  it("selects only clips with resolved captions, at their current revision", () => {
    expect(recapSelection([bookmark(1, true), bookmark(2, false)])).toEqual([
      { bookmarkId: bookmark(1, true).id, expectedRevision: 1 },
    ]);
  });
});

describe("createRecap", () => {
  const request = {
    operationId,
    bookmarks: recapSelection([bookmark(1, true)]),
  };

  it("posts the selection to the session and returns the new recap id", async () => {
    const sent: { url: string; body: unknown }[] = [];
    const result = await createRecap(sessionId, request, (async (
      url: string,
      init: RequestInit,
    ) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ id: recapId }, { status: 201 });
    }) as typeof fetch);

    expect(result).toEqual({ kind: "created", id: recapId });
    expect(sent).toEqual([
      { url: `/api/sessions/${sessionId}/recaps`, body: request },
    ]);
  });

  it.each([
    [429, "busy"],
    [409, "conflict"],
    [404, "rejected"],
    [500, "error"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    expect(await createRecap(sessionId, request, respondWith(status))).toEqual({
      kind,
    });
  });

  it("reports a network failure as retryable", async () => {
    const offline = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await createRecap(sessionId, request, offline)).toEqual({
      kind: "error",
    });
  });
});

describe("getRecap", () => {
  it("returns the owner's recap", async () => {
    const recap = {
      id: recapId,
      status: "running",
      takeaways: [],
      failureReason: null,
    };
    expect(await getRecap(recapId, respondWith(200, recap))).toEqual({
      kind: "ok",
      recap,
    });
  });

  it("treats 404 as missing and a malformed body as an error", async () => {
    expect(await getRecap(recapId, respondWith(404))).toEqual({
      kind: "missing",
    });
    expect(await getRecap(recapId, respondWith(200, { id: 1 }))).toEqual({
      kind: "error",
    });
  });
});
