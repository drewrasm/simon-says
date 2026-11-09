import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRecap,
  exportRecapMarkdown,
  generateRecap,
  getRecap,
  validateTakeaways,
} from "./service";
import { generateTakeaways } from "./model";
import { syntheticRecapOutput, syntheticRecapSelection } from "./fixtures";

vi.mock("server-only", () => ({}));
vi.mock("./model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model")>()),
  generateTakeaways: vi.fn(),
}));
const { recap, bookmark, membership, transaction } = vi.hoisted(() => ({
  recap: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  bookmark: { findMany: vi.fn() },
  membership: { findUnique: vi.fn() },
  transaction: vi.fn(),
}));
vi.mock("../access/database", () => ({
  getDatabase: () => ({
    recap,
    bookmark,
    membership,
    $transaction: transaction,
  }),
}));
const model = vi.mocked(generateTakeaways);
const selection = syntheticRecapSelection();
const principalId = randomUUID();
const sessionId = randomUUID();
const id = randomUUID();
const request = {
  operationId: randomUUID(),
  bookmarks: [{ bookmarkId: selection.id, expectedRevision: 1 }],
};
const record = {
  id,
  ownerPrincipalId: principalId,
  sessionId,
  operationId: request.operationId,
  bookmarkSnapshot: request.bookmarks,
  status: "pending",
  takeaways: [],
  failureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const options = { principalId, sessionId, request };

beforeEach(() => {
  vi.resetAllMocks();
  membership.findUnique.mockResolvedValue({
    revokedAt: null,
    session: { status: "ended" },
  });
  bookmark.findMany.mockResolvedValue([selection]);
  recap.findUnique.mockResolvedValue(record);
  recap.findUniqueOrThrow.mockResolvedValue(record);
  recap.updateMany.mockResolvedValue({ count: 1 });
  recap.create.mockResolvedValue(record);
  transaction.mockImplementation(async (callback) =>
    callback({ recap, bookmark }),
  );
  model.mockResolvedValue(syntheticRecapOutput(selection.id));
});
afterEach(() => vi.useRealTimers());

const expectStatus = (status: string, failureReason?: string) =>
  expect(recap.updateMany).toHaveBeenLastCalledWith({
    where: { id, status: "running" },
    data: expect.objectContaining({
      status,
      ...(failureReason ? { failureReason } : {}),
    }),
  });

describe("recap generation and citations", () => {
  it("does not call the model for unresolved or empty text evidence", async () => {
    for (const segments of [
      [],
      [{ ...selection.evidence.segments[0], text: "  " }],
    ]) {
      bookmark.findMany.mockResolvedValue([
        { ...selection, evidence: { segments, frames: [] } },
      ]);
      await generateRecap(id);
      expectStatus("failed", "no_resolved_evidence");
    }
    expect(model).not.toHaveBeenCalled();
  });

  it("passes only selected passages and IDs, never notes or frame URLs", async () => {
    bookmark.findMany.mockResolvedValue([
      {
        ...selection,
        note: "private note",
        evidence: {
          ...selection.evidence,
          frames: [
            {
              frameId: "frame",
              capturedAtMs: 0,
              imageUrl: "https://private.example/frame",
            },
          ],
        },
      },
    ]);
    await generateRecap(id);
    expect(model).toHaveBeenCalledWith({
      passages: [
        {
          bookmarkId: selection.id,
          segmentId: "synthetic-selected-segment",
          segmentRevision: 2,
          text: selection.evidence.segments[0]?.text,
        },
      ],
      abortSignal: expect.any(AbortSignal),
    });
    expectStatus("ready");
  });

  it("drops unselected bookmarks, incorrect segment revisions, and invented excerpts", () => {
    const valid = syntheticRecapOutput(selection.id);
    const citation = valid.takeaways[0]!.citations[0]!;
    const output = {
      takeaways: [
        ...valid.takeaways,
        {
          text: "unselected",
          citations: [{ ...citation, bookmarkId: randomUUID() }],
        },
        {
          text: "wrong revision",
          citations: [{ ...citation, segmentRevision: 9 }],
        },
        {
          text: "invented excerpt",
          citations: [{ ...citation, excerpt: "Not in the evidence" }],
        },
        { text: "empty excerpt", citations: [{ ...citation, excerpt: " " }] },
        {
          text: "wrong segment",
          citations: [{ ...citation, segmentId: "other-segment" }],
        },
      ],
    };
    expect(validateTakeaways(output, [selection])).toEqual([
      {
        text: valid.takeaways[0]?.text,
        citations: [
          {
            ...citation,
            range: { startMs: 1_000, endMs: 3_000 },
            frameId: "synthetic-frame",
          },
        ],
      },
    ]);
  });

  it("fails when every citation is invalid", async () => {
    model.mockResolvedValue(syntheticRecapOutput(randomUUID()));
    await generateRecap(id);
    expectStatus("failed", "no_valid_citations");
  });

  it("detects changed or deleted selections before calling the model", async () => {
    for (const current of [[], [{ ...selection, revision: 2 }]]) {
      bookmark.findMany.mockResolvedValue(current);
      await generateRecap(id);
      expectStatus("stale");
    }
    expect(model).not.toHaveBeenCalled();
  });

  it("rechecks revisions after generation and discards results if changed", async () => {
    bookmark.findMany
      .mockResolvedValueOnce([selection])
      .mockResolvedValueOnce([{ ...selection, revision: 2 }]);
    await generateRecap(id);
    expectStatus("stale");
    expect(recap.updateMany.mock.lastCall?.[0].data.takeaways).toEqual([]);
  });

  it("stores a content-free failure without modifying bookmarks", async () => {
    model.mockRejectedValue(new Error("Synthetic sensitive model error"));
    await generateRecap(id);
    expectStatus("failed", "generation_failed");
    expect(Object.keys(bookmark)).toEqual(["findMany"]);
  });

  it("bounds a hung model call and ignores late output", async () => {
    vi.useFakeTimers();
    let resolveModel:
      | ((output: Awaited<ReturnType<typeof generateTakeaways>>) => void)
      | undefined;
    model.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveModel = resolve;
        }),
    );
    const generation = generateRecap(id);
    await vi.advanceTimersByTimeAsync(45_001);
    await generation;
    expectStatus("failed", "generation_timeout");
    expect(model.mock.calls[0]?.[0].abortSignal.aborted).toBe(true);
    const writes = recap.updateMany.mock.calls.length;
    resolveModel?.(syntheticRecapOutput(selection.id));
    await Promise.resolve();
    expect(recap.updateMany).toHaveBeenCalledTimes(writes);
  });

  it("claims pending work once", async () => {
    recap.updateMany.mockResolvedValue({ count: 0 });
    await generateRecap(id);
    expect(model).not.toHaveBeenCalled();
  });
});

describe("owner-only creation and reads", () => {
  it("returns the same recap for an operation retry without revalidating old revisions", async () => {
    expect(await createRecap(options)).toEqual({
      response: { id },
      created: false,
    });
    expect(bookmark.findMany).not.toHaveBeenCalled();
    expect(recap.create).not.toHaveBeenCalled();
  });

  it("persists pending before returning a newly created recap", async () => {
    recap.findUnique.mockResolvedValue(null);
    expect(await createRecap(options)).toEqual({
      response: { id },
      created: true,
    });
    expect(recap.create).toHaveBeenCalledWith({
      data: {
        ownerPrincipalId: principalId,
        sessionId,
        operationId: request.operationId,
        bookmarkSnapshot: request.bookmarks,
        status: "pending",
      },
    });
  });

  it("hides missing, cross-owner and cross-session bookmarks", async () => {
    recap.findUnique.mockResolvedValue(null);
    bookmark.findMany.mockResolvedValue([]);
    await expect(createRecap(options)).rejects.toMatchObject({ status: 404 });
    expect(bookmark.findMany).toHaveBeenCalledWith({
      where: {
        ownerPrincipalId: principalId,
        sessionId,
        id: { in: [selection.id] },
      },
      select: { id: true, revision: true },
    });
  });

  it("reports only an owner's revision conflict", async () => {
    recap.findUnique.mockResolvedValue(null);
    bookmark.findMany.mockResolvedValue([{ ...selection, revision: 2 }]);
    await expect(createRecap(options)).rejects.toMatchObject({
      body: { error: "revision_conflict", currentRevision: 2 },
    });
  });

  it("rejects duplicate selections", async () => {
    recap.findUnique.mockResolvedValue(null);
    await expect(
      createRecap({
        ...options,
        request: {
          ...request,
          bookmarks: [...request.bookmarks, ...request.bookmarks],
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("does not disclose another owner's recap or export", async () => {
    const other = { principalId: randomUUID(), id };
    await expect(getRecap(other)).rejects.toMatchObject({ status: 404 });
    await expect(exportRecapMarkdown(other)).rejects.toMatchObject({
      status: 404,
    });
    expect(bookmark.findMany).not.toHaveBeenCalled();
  });

  it("checks current membership before creating or returning content", async () => {
    membership.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      session: { status: "live" },
    });
    await expect(createRecap(options)).rejects.toMatchObject({ status: 404 });
    await expect(getRecap({ principalId, id })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("invalidates a completed recap on a later edit or deletion", async () => {
    recap.findUnique.mockResolvedValue({ ...record, status: "ready" });
    bookmark.findMany.mockResolvedValue([]);
    recap.findUniqueOrThrow.mockResolvedValue({ ...record, status: "stale" });
    expect(await getRecap({ principalId, id })).toMatchObject({
      status: "stale",
      takeaways: [],
    });
    expect(recap.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "stale", takeaways: [], failureReason: null },
      }),
    );
  });

  it("exposes interrupted work as failed after 90 seconds", async () => {
    recap.findUnique.mockResolvedValue({
      ...record,
      updatedAt: new Date(Date.now() - 91_000),
    });
    recap.findUniqueOrThrow.mockResolvedValue({
      ...record,
      status: "failed",
      failureReason: "background_interrupted",
    });
    expect(await getRecap({ principalId, id })).toMatchObject({
      status: "failed",
      failureReason: "background_interrupted",
    });
  });

  it("invalidates changed selections even when generation finishes during a read", async () => {
    bookmark.findMany.mockResolvedValue([]);
    let current = { ...record, status: "ready" };
    recap.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.updatedAt) return { count: 0 };
      current = { ...current, ...data };
      return { count: 1 };
    });
    recap.findUniqueOrThrow.mockImplementation(async () => current);
    expect(await getRecap({ principalId, id })).toMatchObject({
      status: "stale",
      takeaways: [],
    });
  });

  it("exports only ready recaps as escaped Markdown with stored source references", async () => {
    expect(await exportRecapMarkdown({ principalId, id })).toBeNull();
    recap.findUnique.mockResolvedValue({
      ...record,
      status: "ready",
      takeaways: validateTakeaways(syntheticRecapOutput(selection.id), [
        selection,
      ]),
    });
    const markdown = await exportRecapMarkdown({ principalId, id });
    expect(markdown).toContain("# My recap");
    expect(markdown).toContain(
      `bookmark ${selection.id}; segment synthetic-selected-segment revision 2; 1000–3000 ms; frame synthetic-frame`,
    );
    expect(markdown).toContain("> shorter meetings leave more time to build");
  });
});
