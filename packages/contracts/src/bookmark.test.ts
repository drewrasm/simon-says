import { describe, expect, it } from "vitest";
import {
  bookmarkAnchorSchema,
  bookmarkResponseSchema,
  listBookmarksResponseSchema,
  putBookmarkRequestSchema,
  revisionConflictErrorSchema,
  sourceRangeSchema,
} from "@simon-says/contracts/bookmark";
import {
  createRecapRequestSchema,
  recapExportFormatSchema,
  recapResponseSchema,
} from "@simon-says/contracts/recap";
import {
  searchRequestSchema,
  searchResponseSchema,
} from "@simon-says/contracts/search";
import {
  createSessionRequestSchema,
  createSessionResponseSchema,
  joinSessionRequestSchema,
  joinSessionResponseSchema,
  membershipSchema,
  sessionStatusSchema,
} from "@simon-says/contracts/session";

const operationId = "a85f1e8d-78dd-4b7a-8095-4ac712a91813";
const bookmarkId = "0b5d3c3e-55a4-4c55-9d0c-0d0f1f4f8a01";
const recapId = "6f1e2a7b-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
const membershipId = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const principalId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const inviteCode = "invite-code-0123456789";
const range = { startMs: 0, endMs: 30_000 };
const paragraph = {
  kind: "paragraph",
  segmentId: "w1-0",
  segmentRevision: 1,
  range,
};
const bookmark = {
  id: bookmarkId,
  sessionId: "s1",
  revision: 1,
  anchor: paragraph,
  requestedRange: range,
  actualRange: null,
  clockUncertaintyMs: 100,
  completeness: "pending",
  evidence: { segments: [], frames: [] },
  note: null,
  createdAt: "2026-11-09T18:00:00Z",
  updatedAt: "2026-11-09T18:00:00Z",
};
const citation = {
  bookmarkId,
  segmentId: "w1-0",
  segmentRevision: 1,
  range,
  excerpt: "Keep source timestamps.",
  frameId: null,
};

describe("Track 3 contracts", () => {
  it("accepts session creation and join payloads without accounts", () => {
    expect(createSessionRequestSchema.parse({})).toEqual({});
    expect(createSessionRequestSchema.parse({ title: " Talk " })).toEqual({
      title: "Talk",
    });
    expect(createSessionRequestSchema.safeParse({ title: " " }).success).toBe(
      false,
    );
    expect(
      createSessionRequestSchema.safeParse({ title: "x".repeat(121) }).success,
    ).toBe(false);
    expect(
      createSessionResponseSchema.safeParse({
        sessionId: "s1",
        hostPath: "/host/s1",
        inviteCode,
        joinPath: `/join/${inviteCode}`,
      }).success,
    ).toBe(true);
    expect(joinSessionRequestSchema.parse({ inviteCode })).toEqual({
      inviteCode,
    });
    expect(
      joinSessionRequestSchema.safeParse({ inviteCode: "short" }).success,
    ).toBe(false);
    expect(
      joinSessionResponseSchema.safeParse({
        sessionId: "s1",
        membershipId,
        role: "attendee",
      }).success,
    ).toBe(true);
    expect(
      joinSessionResponseSchema.safeParse({
        sessionId: "s1",
        membershipId,
        role: "host",
      }).success,
    ).toBe(false);
    expect(
      membershipSchema.safeParse({
        sessionId: "s1",
        principalId,
        role: "admin",
      }).success,
    ).toBe(false);
    expect(sessionStatusSchema.parse("expired")).toBe("expired");
  });

  it("accepts zero-length ranges and rejects inverted or negative times, allowing fractional caption times", () => {
    expect(sourceRangeSchema.parse({ startMs: 0, endMs: 0 })).toEqual({
      startMs: 0,
      endMs: 0,
    });
    for (const invalid of [
      { startMs: -1, endMs: 0 },
      { startMs: 0, endMs: -1 },
      { startMs: 10, endMs: 9 },
    ]) {
      expect(sourceRangeSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      sourceRangeSchema.safeParse({ startMs: 0.5, endMs: 1234.5 }).success,
    ).toBe(true);
  });

  it("requires the fields belonging to each anchor kind", () => {
    expect(bookmarkAnchorSchema.parse(paragraph)).toEqual(paragraph);
    expect(bookmarkAnchorSchema.parse({ kind: "live", markedAtMs: 0 })).toEqual(
      { kind: "live", markedAtMs: 0 },
    );
    for (const invalid of [
      { kind: "live", range },
      { ...paragraph, kind: "other" },
      { ...paragraph, segmentRevision: 0 },
      { ...paragraph, segmentId: "bad:id" },
      { ...paragraph, range: { startMs: 2, endMs: 1 } },
      { kind: "live", markedAtMs: -1 },
    ]) {
      expect(bookmarkAnchorSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("validates bookmark retries, revision checks, notes, and pending evidence", () => {
    const request = {
      sessionId: "s1",
      operationId,
      expectedRevision: null,
      anchor: paragraph,
    };
    expect(putBookmarkRequestSchema.parse(request)).toEqual(request);
    expect(
      putBookmarkRequestSchema.safeParse({ ...request, expectedRevision: 1 })
        .success,
    ).toBe(true);
    for (const invalid of [
      { ...request, operationId: "retry" },
      { ...request, expectedRevision: 0 },
      { ...request, note: "x".repeat(4_001) },
    ]) {
      expect(putBookmarkRequestSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      listBookmarksResponseSchema.parse({ bookmarks: [bookmark] }),
    ).toEqual({
      bookmarks: [bookmark],
    });
    expect(
      bookmarkResponseSchema.safeParse({
        ...bookmark,
        actualRange: { startMs: 2, endMs: 1 },
      }).success,
    ).toBe(false);
    expect(
      revisionConflictErrorSchema.parse({
        error: "revision_conflict",
        id: bookmarkId,
        expectedRevision: 1,
        currentRevision: 2,
      }).currentRevision,
    ).toBe(2);
  });

  it("preserves resolved source evidence and nullable frame URLs", () => {
    const resolved = {
      ...bookmark,
      actualRange: range,
      completeness: "complete",
      evidence: {
        segments: [
          { segmentId: "w1-0", revision: 1, range, text: citation.excerpt },
        ],
        frames: [{ frameId: "f1", capturedAtMs: 0, imageUrl: null }],
      },
    };
    expect(bookmarkResponseSchema.parse(resolved)).toEqual(resolved);
    expect(
      bookmarkResponseSchema.safeParse({
        ...resolved,
        evidence: {
          ...resolved.evidence,
          frames: [
            { frameId: "f1", capturedAtMs: 0, imageUrl: "javascript:x" },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("bounds search inputs, defaults limits, and exposes unavailable indexing", () => {
    expect(searchRequestSchema.parse({ query: " timestamps " })).toEqual({
      query: "timestamps",
      limit: 10,
    });
    for (const invalid of [
      { query: " " },
      { query: "x".repeat(501) },
      { query: "x", limit: 0 },
      { query: "x", limit: 21 },
      { query: "x", limit: 1.5 },
    ]) {
      expect(searchRequestSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      searchResponseSchema.parse({
        results: [],
        nextCursor: null,
        indexingState: "unavailable",
      }).indexingState,
    ).toBe("unavailable");
    expect(
      searchResponseSchema.safeParse({
        results: [
          { ...citation, passageId: "p1", range: { startMs: 2, endMs: 1 } },
        ],
        nextCursor: null,
        indexingState: "current",
      }).success,
    ).toBe(false);
  });

  it("requires revision-bound selections and cited recap takeaways", () => {
    const request = {
      operationId,
      bookmarks: [{ bookmarkId, expectedRevision: 1 }],
    };
    expect(createRecapRequestSchema.parse(request)).toEqual(request);
    expect(
      createRecapRequestSchema.safeParse({ ...request, bookmarks: [] }).success,
    ).toBe(false);
    expect(
      createRecapRequestSchema.safeParse({
        ...request,
        bookmarks: [{ bookmarkId, expectedRevision: null }],
      }).success,
    ).toBe(false);
    const recap = {
      id: recapId,
      status: "ready",
      takeaways: [{ text: "Keep timestamps.", citations: [citation] }],
      failureReason: null,
    };
    expect(recapResponseSchema.parse(recap)).toEqual(recap);
    expect(
      recapResponseSchema.safeParse({
        ...recap,
        takeaways: [{ text: "Unsupported", citations: [] }],
      }).success,
    ).toBe(false);
    expect(
      recapResponseSchema.safeParse({
        ...recap,
        takeaways: [
          {
            text: "Invalid source",
            citations: [{ ...citation, range: { startMs: 2, endMs: 1 } }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(recapExportFormatSchema.parse("markdown")).toBe("markdown");
    expect(recapExportFormatSchema.safeParse("html").success).toBe(false);
  });
});
