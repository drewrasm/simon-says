import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { saveNote, type NoteDraft } from "./save-note";

const draft: NoteDraft = {
  bookmarkId: randomUUID(),
  operationId: randomUUID(),
  sessionId: randomUUID(),
  anchor: { kind: "live", markedAtMs: 804_000 },
};

const saved = {
  id: draft.bookmarkId,
  sessionId: draft.sessionId,
  revision: 1,
  anchor: draft.anchor,
  requestedRange: { startMs: 774_000, endMs: 804_000 },
  actualRange: null,
  clockUncertaintyMs: 5_000,
  completeness: "pending",
  evidence: { segments: [], frames: [] },
  note: "Check the mics",
  createdAt: "2026-11-09T20:13:24.000Z",
  updatedAt: "2026-11-09T20:13:24.000Z",
};

const reply =
  (status: number, body: unknown): typeof fetch =>
  async () =>
    Response.json(body, { status });

describe("saveNote", () => {
  it("PUTs a live anchor to the draft's bookmark ID", async () => {
    let url = "";
    let init: RequestInit | undefined;
    await saveNote(draft, "Check the mics", async (input, options) => {
      url = String(input);
      init = options;
      return Response.json(saved);
    });
    expect(url).toBe(`/api/bookmarks/${draft.bookmarkId}`);
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      sessionId: draft.sessionId,
      operationId: draft.operationId,
      expectedRevision: null,
      anchor: draft.anchor,
      note: "Check the mics",
    });
  });

  it("returns the saved bookmark", async () => {
    const result = await saveNote(draft, "Check the mics", reply(200, saved));
    expect(result).toMatchObject({ kind: "saved", bookmark: { id: saved.id } });
  });

  it("treats 400 and 404 as rejected", async () => {
    for (const status of [400, 404]) {
      expect(await saveNote(draft, "x", reply(status, {}))).toEqual({
        kind: "rejected",
      });
    }
  });

  it("reports 409 as a conflict, not a retryable error", async () => {
    expect(
      await saveNote(
        draft,
        "edited",
        reply(409, {
          error: "revision_conflict",
          id: draft.bookmarkId,
          expectedRevision: null,
          currentRevision: 1,
        }),
      ),
    ).toEqual({ kind: "conflict" });
  });

  it("rejects a note over the contract limit without a request", async () => {
    let called = false;
    const result = await saveNote(draft, "a".repeat(4_001), async () => {
      called = true;
      return Response.json(saved);
    });
    expect(result).toEqual({ kind: "rejected" });
    expect(called).toBe(false);
  });

  it("sends a paragraph anchor for a note with an attached line", async () => {
    let body: unknown;
    const anchor = {
      kind: "paragraph" as const,
      segmentId: "seg-1",
      segmentRevision: 2,
      range: { startMs: 800_000, endMs: 804_000 },
    };
    await saveNote({ ...draft, anchor }, "Quote this", async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ ...saved, anchor });
    });
    expect(body).toMatchObject({ anchor, note: "Quote this" });
  });

  it("treats 503 source_unavailable as retryable", async () => {
    expect(
      await saveNote(draft, "x", reply(503, { error: "source_unavailable" })),
    ).toEqual({ kind: "error" });
  });

  it("reports network failures and malformed bodies as retryable", async () => {
    expect(
      await saveNote(draft, "x", async () => {
        throw new TypeError("offline");
      }),
    ).toEqual({ kind: "error" });
    expect(await saveNote(draft, "x", reply(200, { id: "nope" }))).toEqual({
      kind: "error",
    });
  });
});
