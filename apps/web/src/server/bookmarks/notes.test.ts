import { randomUUID } from "node:crypto";
import type { PutBookmarkRequest } from "@simon-says/contracts/bookmark";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "../access/errors";
import {
  APPROXIMATE_CLOCK_UNCERTAINTY_MS,
  listNotes,
  putNote,
  RevisionConflictError,
  sessionElapsedMs,
} from "./notes";

vi.mock("server-only", () => ({}));
const { requireMembership, findUnique, create, findMany } = vi.hoisted(() => ({
  requireMembership: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock("../access/membership", () => ({ requireMembership }));
vi.mock("../access/database", () => ({
  getDatabase: () => ({ bookmark: { findUnique, create, findMany } }),
}));

const principalId = randomUUID();
const sessionId = randomUUID();
const bookmarkId = randomUUID();
const operationId = randomUUID();
const createdAt = new Date("2026-11-09T20:00:00Z");
const now = createdAt.getTime() + 10 * 60_000;

const request = (
  overrides: Partial<PutBookmarkRequest> = {},
): PutBookmarkRequest => ({
  sessionId,
  operationId,
  expectedRevision: null,
  anchor: { kind: "live", markedAtMs: 9 * 60_000 },
  note: "  Check the mics in our own venue.  ",
  ...overrides,
});

const row = (overrides: object = {}) => ({
  id: bookmarkId,
  ownerPrincipalId: principalId,
  sessionId,
  operationId,
  anchorKind: "live",
  markedAtMs: 9 * 60_000,
  segmentId: null,
  segmentRevision: null,
  requestedStartMs: 9 * 60_000 - 30_000,
  requestedEndMs: 9 * 60_000,
  actualStartMs: null,
  actualEndMs: null,
  clockUncertaintyMs: APPROXIMATE_CLOCK_UNCERTAINTY_MS,
  revision: 1,
  note: "Check the mics in our own venue.",
  completeness: "pending",
  evidence: null,
  createdAt: new Date(now),
  updatedAt: new Date(now),
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  requireMembership.mockResolvedValue({
    principalId,
    sessionId,
    role: "attendee",
    session: { id: sessionId, createdAt },
  });
});

describe("putNote", () => {
  it("creates a live note covering the previous 30 seconds", async () => {
    findUnique.mockResolvedValue(null);
    create.mockImplementation(async ({ data }) => row(data));

    const saved = await putNote({
      principalId,
      bookmarkId,
      request: request(),
      now,
    });

    expect(requireMembership).toHaveBeenCalledWith({ sessionId, principalId });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      id: bookmarkId,
      ownerPrincipalId: principalId,
      anchorKind: "live",
      requestedStartMs: 9 * 60_000 - 30_000,
      requestedEndMs: 9 * 60_000,
      note: "Check the mics in our own venue.",
    });
    expect(saved).toMatchObject({
      id: bookmarkId,
      anchor: { kind: "live", markedAtMs: 9 * 60_000 },
      actualRange: null,
      completeness: "pending",
      evidence: { segments: [], frames: [] },
      note: "Check the mics in our own venue.",
    });
  });

  it("clamps the window at the start of the session", async () => {
    findUnique.mockResolvedValue(null);
    create.mockImplementation(async ({ data }) => row(data));
    await putNote({
      principalId,
      bookmarkId,
      request: request({ anchor: { kind: "live", markedAtMs: 10_000 } }),
      now,
    });
    expect(create.mock.calls[0]?.[0].data.requestedStartMs).toBe(0);
  });

  it("returns the stored note when the same operation is retried", async () => {
    findUnique.mockResolvedValue(row());
    const saved = await putNote({
      principalId,
      bookmarkId,
      request: request(),
      now,
    });
    expect(create).not.toHaveBeenCalled();
    expect(saved.id).toBe(bookmarkId);
  });

  it.each([
    ["different note text", request({ note: "An edited note" })],
    [
      "a different mark",
      request({ anchor: { kind: "live", markedAtMs: 8 * 60_000 } }),
    ],
    ["a different session", request({ sessionId: randomUUID() })],
  ])("conflicts when a retried operation carries %s", async (_label, body) => {
    findUnique.mockResolvedValue(row());
    await expect(
      putNote({ principalId, bookmarkId, request: body, now }),
    ).rejects.toMatchObject({
      constructor: RevisionConflictError,
      id: bookmarkId,
      expectedRevision: null,
      currentRevision: 1,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("answers a concurrent duplicate from the stored row", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row());
    create.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );
    const saved = await putNote({
      principalId,
      bookmarkId,
      request: request(),
      now,
    });
    expect(saved.id).toBe(bookmarkId);
  });

  it("reports another owner's ID as an absent conflict", async () => {
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(row({ ownerPrincipalId: randomUUID() }));
    create.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );
    await expect(
      putNote({ principalId, bookmarkId, request: request(), now }),
    ).rejects.toMatchObject({
      constructor: RevisionConflictError,
      currentRevision: null,
    });
  });

  it.each([
    ["an empty note", request({ note: "   " })],
    ["a missing note", request({ note: undefined })],
    ["an update", request({ expectedRevision: 1 })],
    [
      "a paragraph anchor",
      request({
        anchor: {
          kind: "paragraph",
          segmentId: "seg",
          segmentRevision: 1,
          range: { startMs: 0, endMs: 1 },
        },
      }),
    ],
    [
      "a mark later than the session clock",
      request({ anchor: { kind: "live", markedAtMs: 11 * 60_000 } }),
    ],
  ])("rejects %s with 400", async (_label, body) => {
    await expect(
      putNote({ principalId, bookmarkId, request: body, now }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_request" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID bookmark ID before any lookup", async () => {
    await expect(
      putNote({ principalId, bookmarkId: "nope", request: request(), now }),
    ).rejects.toMatchObject({ status: 404 });
    expect(requireMembership).not.toHaveBeenCalled();
  });

  it("denies non-members through the membership check", async () => {
    requireMembership.mockRejectedValue(new AccessError(404, "not_found"));
    await expect(
      putNote({ principalId, bookmarkId, request: request(), now }),
    ).rejects.toMatchObject({ status: 404 });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("listNotes", () => {
  it("lists only the caller's bookmarks in the session", async () => {
    findMany.mockResolvedValue([row()]);
    const notes = await listNotes({ principalId, sessionId });
    expect(findMany).toHaveBeenCalledWith({
      where: { ownerPrincipalId: principalId, sessionId },
      orderBy: { createdAt: "desc" },
    });
    expect(notes).toHaveLength(1);
  });

  it("checks membership before reading", async () => {
    requireMembership.mockRejectedValue(new AccessError(404, "not_found"));
    await expect(listNotes({ principalId, sessionId })).rejects.toMatchObject({
      status: 404,
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("sessionElapsedMs", () => {
  it("never goes negative", () => {
    expect(sessionElapsedMs(createdAt, createdAt.getTime() - 1)).toBe(0);
    expect(sessionElapsedMs(createdAt, createdAt.getTime() + 1500)).toBe(1500);
  });
});
