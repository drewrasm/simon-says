import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteBookmark,
  listBookmarks,
  putBookmark,
  type BookmarkRecord,
} from "./service";
import {
  syntheticSearchResponse,
  syntheticSegment,
} from "../evidence/fixtures";

vi.mock("server-only", () => ({}));
const { bookmark, membership } = vi.hoisted(() => ({
  bookmark: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateManyAndReturn: vi.fn(),
    deleteMany: vi.fn(),
  },
  membership: { findUnique: vi.fn() },
}));
vi.mock("../access/database", () => ({
  getDatabase: () => ({ bookmark, membership }),
}));
const fetchMock = vi.fn<typeof fetch>();
const principalId = randomUUID();
const sessionId = randomUUID();
const id = randomUUID();
const operationId = randomUUID();
const record: BookmarkRecord = {
  id,
  ownerPrincipalId: principalId,
  sessionId,
  operationId,
  anchorKind: "live",
  markedAtMs: 35_000,
  segmentId: null,
  segmentRevision: null,
  requestedStartMs: 5000,
  requestedEndMs: 35_000,
  actualStartMs: null,
  actualEndMs: null,
  clockUncertaintyMs: 0,
  revision: 1,
  note: "Synthetic private note",
  completeness: "pending",
  evidence: null,
  createdAt: new Date("2026-11-09T20:00:00.000Z"),
  updatedAt: new Date("2026-11-09T20:00:00.000Z"),
};
const request = () =>
  ({
    sessionId,
    operationId,
    expectedRevision: null,
    anchor: { kind: "live", markedAtMs: 35_000 },
  }) as const;
const options = () => ({ principalId, id, request: request() });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ELASTICSEARCH_URL", "https://synthetic-elastic.example");
  vi.stubEnv("ELASTICSEARCH_API_KEY", "synthetic-test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockRejectedValue(new Error("Synthetic ES outage"));
  membership.findUnique.mockResolvedValue({
    revokedAt: null,
    session: { status: "live" },
  });
  bookmark.findUnique.mockResolvedValue(null);
  bookmark.create.mockResolvedValue(record);
  bookmark.updateManyAndReturn.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("owner-only bookmarks", () => {
  it("persists a pending live mark when ES fails", async () => {
    expect(await putBookmark(options())).toMatchObject({
      status: 201,
      bookmark: {
        id,
        revision: 1,
        anchor: request().anchor,
        requestedRange: { startMs: 5000, endMs: 35_000 },
        completeness: "pending",
      },
    });
    expect(bookmark.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestedStartMs: 5000,
        requestedEndMs: 35_000,
        completeness: "pending",
      }),
    });
  });

  it("checks membership before any source query or bookmark write", async () => {
    membership.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      session: { status: "live" },
    });
    await expect(putBookmark(options())).rejects.toMatchObject({ status: 404 });
    await expect(
      listBookmarks({ principalId, sessionId }),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bookmark.findUnique).not.toHaveBeenCalled();
    expect(bookmark.create).not.toHaveBeenCalled();
  });

  it("returns the applied mutation for an idempotent retry without resolving or rewriting", async () => {
    bookmark.findUnique.mockResolvedValue(record);
    expect(await putBookmark(options())).toMatchObject({
      status: 200,
      bookmark: { id, revision: 1 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bookmark.create).not.toHaveBeenCalled();
    expect(bookmark.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it("conflicts for a different create operation or stale revision", async () => {
    bookmark.findUnique.mockResolvedValue({
      ...record,
      operationId: randomUUID(),
      revision: 2,
    });
    await expect(putBookmark(options())).rejects.toMatchObject({
      body: {
        error: "revision_conflict",
        expectedRevision: null,
        currentRevision: 2,
      },
    });
    await expect(
      putBookmark({
        ...options(),
        request: { ...request(), expectedRevision: 1 },
      }),
    ).rejects.toMatchObject({
      body: { expectedRevision: 1, currentRevision: 2 },
    });
    expect(bookmark.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it("updates a note with CAS while preserving the original range and anchor", async () => {
    bookmark.findUnique.mockResolvedValue(record);
    const nextOperation = randomUUID();
    bookmark.updateManyAndReturn.mockResolvedValue([
      {
        ...record,
        operationId: nextOperation,
        note: "Edited synthetic note",
        revision: 2,
      },
    ]);
    expect(
      await putBookmark({
        ...options(),
        request: {
          ...request(),
          operationId: nextOperation,
          expectedRevision: 1,
          note: "Edited synthetic note",
          anchor: { kind: "live", markedAtMs: 99_000 },
        },
      }),
    ).toMatchObject({
      bookmark: {
        revision: 2,
        note: "Edited synthetic note",
        anchor: request().anchor,
        requestedRange: { startMs: 5000, endMs: 35_000 },
      },
    });
    expect(bookmark.updateManyAndReturn).toHaveBeenCalledWith({
      where: { id, ownerPrincipalId: principalId, sessionId, revision: 1 },
      data: expect.objectContaining({
        revision: { increment: 1 },
        operationId: nextOperation,
      }),
    });
  });

  it("does not clear an omitted note", async () => {
    bookmark.findUnique.mockResolvedValue(record);
    bookmark.updateManyAndReturn.mockResolvedValue([
      { ...record, revision: 2 },
    ]);
    const result = await putBookmark({
      ...options(),
      request: { ...request(), operationId: randomUUID(), expectedRevision: 1 },
    });
    expect(result.bookmark.note).toBe(record.note);
    expect(
      bookmark.updateManyAndReturn.mock.calls[0]?.[0].data,
    ).not.toHaveProperty("note");
  });

  it("reports a lost CAS with the current owner revision", async () => {
    bookmark.findUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, revision: 2 });
    await expect(
      putBookmark({
        ...options(),
        request: {
          ...request(),
          operationId: randomUUID(),
          expectedRevision: 1,
        },
      }),
    ).rejects.toMatchObject({ body: { currentRevision: 2 } });
  });

  it("returns the winner of a concurrent same-operation create retry", async () => {
    bookmark.create.mockRejectedValue(
      Object.assign(new Error("Unique conflict"), { code: "P2002" }),
    );
    bookmark.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(record);
    expect(await putBookmark(options())).toMatchObject({
      status: 200,
      bookmark: { id, revision: 1 },
    });
  });

  it("hides another owner's bookmark and revision even for a matching operation ID", async () => {
    bookmark.findUnique.mockResolvedValue({
      ...record,
      ownerPrincipalId: randomUUID(),
      revision: 42,
    });
    await expect(putBookmark(options())).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    await expect(deleteBookmark({ principalId, id })).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bookmark.deleteMany).not.toHaveBeenCalled();
  });

  it("denies a missing update without disclosing revisions", async () => {
    await expect(
      putBookmark({
        ...options(),
        request: { ...request(), expectedRevision: 1 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("bounds lazy pending resolution to five owner records and leaves mutation revision unchanged", async () => {
    const records = Array.from({ length: 6 }, (_, index) => ({
      ...record,
      id: randomUUID(),
      updatedAt: new Date(record.updatedAt.getTime() + index),
    }));
    bookmark.findMany.mockResolvedValue(records);
    fetchMock.mockImplementation(async (url) =>
      Response.json(
        syntheticSearchResponse(
          String(url).includes("simon-says-segments")
            ? [syntheticSegment({ sessionId, endMs: 40_000 })]
            : [],
        ),
      ),
    );
    bookmark.updateManyAndReturn.mockImplementation(async ({ where, data }) => [
      { ...record, id: where.id, ...data },
    ]);
    const result = await listBookmarks({ principalId, sessionId });
    expect(bookmark.findMany).toHaveBeenCalledWith({
      where: { ownerPrincipalId: principalId, sessionId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(result.bookmarks.map((b) => [b.completeness, b.revision])).toEqual([
      ["complete", 1],
      ["complete", 1],
      ["complete", 1],
      ["complete", 1],
      ["complete", 1],
      ["pending", 1],
    ]);
    expect(bookmark.updateManyAndReturn).toHaveBeenCalledTimes(5);
  });

  it("retries least-recently-attempted pending ranges and skips zero-width ones", async () => {
    const attemptedAt = (minute: number) =>
      new Date(`2026-11-09T20:0${minute}:00.000Z`);
    const records = Array.from({ length: 6 }, (_, index) => ({
      ...record,
      id: randomUUID(),
      updatedAt: attemptedAt(6 - index),
    }));
    const zeroWidth = {
      ...record,
      id: randomUUID(),
      markedAtMs: 0,
      requestedStartMs: 0,
      requestedEndMs: 0,
      updatedAt: attemptedAt(0),
    };
    bookmark.findMany.mockResolvedValue([...records, zeroWidth]);
    bookmark.updateManyAndReturn.mockImplementation(async ({ where, data }) => [
      { ...record, id: where.id, ...data },
    ]);

    const result = await listBookmarks({ principalId, sessionId });

    const attemptedIds = bookmark.updateManyAndReturn.mock.calls.map(
      ([{ where }]) => where.id,
    );
    expect(attemptedIds.sort()).toEqual(
      records
        .slice(1)
        .map((r) => r.id)
        .sort(),
    );
    expect(bookmark.updateManyAndReturn).toHaveBeenCalledWith({
      where: expect.objectContaining({ completeness: "pending", revision: 1 }),
      data: { updatedAt: expect.any(Date) },
    });
    expect(result.bookmarks.map((b) => b.completeness)).toEqual(
      Array(7).fill("pending"),
    );
  });

  it("does not recreate a bookmark deleted while lazy resolution ran", async () => {
    bookmark.findMany.mockResolvedValue([record]);
    bookmark.findFirst.mockResolvedValue(null);
    fetchMock.mockImplementation(async (url) =>
      Response.json(
        syntheticSearchResponse(
          String(url).includes("simon-says-segments")
            ? [syntheticSegment({ sessionId, endMs: 40_000 })]
            : [],
        ),
      ),
    );
    expect(await listBookmarks({ principalId, sessionId })).toEqual({
      bookmarks: [],
    });
  });

  it("deletes only the owner record and permits an already-absent retry", async () => {
    bookmark.findUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(null);
    await deleteBookmark({ principalId, id });
    await deleteBookmark({ principalId, id });
    expect(bookmark.deleteMany).toHaveBeenCalledOnce();
    expect(bookmark.deleteMany).toHaveBeenCalledWith({
      where: { id, ownerPrincipalId: principalId },
    });
  });
});
