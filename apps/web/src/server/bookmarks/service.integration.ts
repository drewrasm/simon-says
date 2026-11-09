import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getDatabase } from "../access/database";
import { deleteBookmark, listBookmarks, putBookmark } from "./service";
import {
  syntheticSearchResponse,
  syntheticSegment,
} from "../evidence/fixtures";

vi.mock("server-only", () => ({}));
const database = getDatabase();
const sessionId = randomUUID();
const host = randomUUID();
const attendeeA = randomUUID();
const attendeeB = randomUUID();
const fetchMock = vi.fn<typeof fetch>();
const createOptions = (principalId = attendeeA, id = randomUUID()) => ({
  principalId,
  id,
  request: {
    sessionId,
    operationId: randomUUID(),
    expectedRevision: null,
    anchor: { kind: "live", markedAtMs: 35_000 },
    note: "Synthetic integration note",
  } as const,
});

beforeAll(async () => {
  await database.principal.createMany({
    data: [host, attendeeA, attendeeB].map((id) => ({ id })),
  });
  await database.session.create({
    data: {
      id: sessionId,
      hostPrincipalId: host,
      hostLinkTokenHash: randomUUID(),
      inviteCode: randomUUID(),
      memberships: {
        create: [
          { principalId: host, role: "host" },
          { principalId: attendeeA, role: "attendee" },
          { principalId: attendeeB, role: "attendee" },
        ],
      },
    },
  });
});
beforeEach(async () => {
  await database.bookmark.deleteMany({ where: { sessionId } });
  await database.membership.updateMany({
    where: { sessionId },
    data: { revokedAt: null },
  });
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(
    new Error("Synthetic ES outage at HTTP boundary"),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ELASTICSEARCH_URL", "https://synthetic-elastic.example");
  vi.stubEnv("ELASTICSEARCH_API_KEY", "synthetic-test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  try {
    await database.session.deleteMany({ where: { id: sessionId } });
    await database.principal.deleteMany({
      where: { id: { in: [host, attendeeA, attendeeB] } },
    });
  } finally {
    await database.$disconnect();
  }
});

describe("bookmarks with real local Postgres and synthetic ES HTTP", () => {
  it("creates, retries, edits, preserves an omitted note, conflicts, lists and deletes", async () => {
    const options = createOptions();
    const created = await putBookmark(options);
    expect(created).toMatchObject({
      status: 201,
      bookmark: { revision: 1, completeness: "pending" },
    });
    expect(await putBookmark(options)).toMatchObject({
      status: 200,
      bookmark: created.bookmark,
    });
    const edit = {
      ...options,
      request: {
        ...options.request,
        expectedRevision: 1,
        operationId: randomUUID(),
        note: "Edited synthetic note",
      },
    };
    expect(await putBookmark(edit)).toMatchObject({
      bookmark: { revision: 2, note: "Edited synthetic note" },
    });
    expect(await putBookmark(edit)).toMatchObject({
      bookmark: { revision: 2 },
    });
    await expect(
      putBookmark({
        ...edit,
        request: { ...edit.request, operationId: randomUUID() },
      }),
    ).rejects.toMatchObject({
      body: { error: "revision_conflict", currentRevision: 2 },
    });
    const { note: omittedNote, ...requestWithoutNote } = edit.request;
    expect(omittedNote).toBe("Edited synthetic note");
    expect(
      await putBookmark({
        ...options,
        request: {
          ...requestWithoutNote,
          expectedRevision: 2,
          operationId: randomUUID(),
        },
      }),
    ).toMatchObject({
      bookmark: { revision: 3, note: "Edited synthetic note" },
    });
    expect(
      (await listBookmarks({ principalId: attendeeA, sessionId })).bookmarks,
    ).toHaveLength(1);
    await deleteBookmark(options);
    await deleteBookmark(options);
    expect(
      (await listBookmarks({ principalId: attendeeA, sessionId })).bookmarks,
    ).toEqual([]);
  });

  it("isolates owners, including the host, without revealing revisions", async () => {
    const options = createOptions();
    await putBookmark(options);
    expect(await listBookmarks({ principalId: attendeeB, sessionId })).toEqual({
      bookmarks: [],
    });
    for (const principalId of [attendeeB, host]) {
      await expect(
        putBookmark({ ...options, principalId }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        putBookmark({
          ...options,
          principalId,
          request: { ...options.request, expectedRevision: 1 },
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        deleteBookmark({ ...options, principalId }),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect(await database.bookmark.count({ where: { sessionId } })).toBe(1);
  });

  it("denies revoked membership before ES reads and mutation", async () => {
    const options = createOptions();
    await putBookmark(options);
    await database.membership.updateMany({
      where: { sessionId, principalId: attendeeA },
      data: { revokedAt: new Date() },
    });
    fetchMock.mockClear();
    await expect(putBookmark(options)).rejects.toMatchObject({ status: 404 });
    await expect(
      listBookmarks({ principalId: attendeeA, sessionId }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(deleteBookmark(options)).rejects.toMatchObject({
      status: 404,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("converges concurrent create retries to one bookmark", async () => {
    const options = createOptions();
    const results = await Promise.all([
      putBookmark(options),
      putBookmark(options),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0]?.bookmark).toEqual(results[1]?.bookmark);
    expect(await database.bookmark.count({ where: { sessionId } })).toBe(1);
  });

  it("allows only one concurrent edit for an expected revision", async () => {
    const options = createOptions();
    await putBookmark(options);
    const results = await Promise.allSettled(
      ["first", "second"].map((note) =>
        putBookmark({
          ...options,
          request: {
            ...options.request,
            expectedRevision: 1,
            operationId: randomUUID(),
            note,
          },
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
      body: { error: "revision_conflict", currentRevision: 2 },
    });
    expect(
      await database.bookmark.findUniqueOrThrow({ where: { id: options.id } }),
    ).toMatchObject({ revision: 2 });
  });

  it("makes concurrent retries of an update increment only once", async () => {
    const options = createOptions();
    await putBookmark(options);
    const edit = {
      ...options,
      request: {
        ...options.request,
        expectedRevision: 1,
        operationId: randomUUID(),
      },
    };
    const results = await Promise.all([putBookmark(edit), putBookmark(edit)]);
    expect(results.map((r) => r.bookmark.revision)).toEqual([2, 2]);
    expect(
      await database.bookmark.findUniqueOrThrow({ where: { id: options.id } }),
    ).toMatchObject({ revision: 2, operationId: edit.request.operationId });
  });

  it("does not reuse an operation ID for a different bookmark", async () => {
    const options = createOptions();
    await putBookmark(options);
    await expect(
      putBookmark({ ...options, id: randomUUID() }),
    ).rejects.toMatchObject({
      body: { error: "revision_conflict", currentRevision: null },
    });
  });

  it("stores paragraph anchor identity and fixed range on the existing schema", async () => {
    const options = createOptions();
    const anchor = {
      kind: "paragraph",
      segmentId: "synthetic-segment",
      segmentRevision: 3,
      range: { startMs: 12_000, endMs: 18_000 },
    } as const;
    fetchMock.mockImplementation(async (url) =>
      Response.json(
        syntheticSearchResponse(
          String(url).includes("simon-says-segments")
            ? [
                syntheticSegment({
                  sessionId,
                  segmentId: anchor.segmentId,
                  revision: anchor.segmentRevision,
                  ...anchor.range,
                }),
              ]
            : [],
        ),
      ),
    );
    const created = await putBookmark({
      ...options,
      request: { ...options.request, anchor },
    });
    expect(created.bookmark).toMatchObject({
      anchor,
      requestedRange: anchor.range,
    });
    const updated = await putBookmark({
      ...options,
      request: {
        ...options.request,
        expectedRevision: 1,
        operationId: randomUUID(),
        anchor: { kind: "live", markedAtMs: 99_000 },
      },
    });
    expect(updated.bookmark).toMatchObject({
      anchor,
      requestedRange: anchor.range,
      revision: 2,
    });
  });

  it("lazily materializes pending evidence without bumping the mutation revision and retains it during outages", async () => {
    const options = createOptions();
    await putBookmark(options);
    fetchMock.mockImplementation(async (url) =>
      Response.json(
        syntheticSearchResponse(
          String(url).includes("simon-says-segments")
            ? [syntheticSegment({ sessionId, endMs: 40_000 })]
            : [],
        ),
      ),
    );
    const resolved = await listBookmarks({ principalId: attendeeA, sessionId });
    expect(resolved.bookmarks[0]).toMatchObject({
      completeness: "complete",
      revision: 1,
      actualRange: { startMs: 5000, endMs: 35_000 },
      evidence: { segments: [{ segmentId: "segment-1", revision: 1 }] },
    });
    fetchMock.mockRejectedValue(new Error("Synthetic outage"));
    const edited = await putBookmark({
      ...options,
      request: {
        ...options.request,
        expectedRevision: 1,
        operationId: randomUUID(),
      },
    });
    expect(edited.bookmark).toMatchObject({
      completeness: "pending",
      revision: 2,
      evidence: resolved.bookmarks[0]?.evidence,
      actualRange: { startMs: 5000, endMs: 35_000 },
    });
  });

  it("rotates the bounded retry budget so later pending bookmarks resolve across reads", async () => {
    const ids = Array.from({ length: 6 }, () => randomUUID());
    for (const [index, id] of ids.entries()) {
      await putBookmark(createOptions(attendeeA, id));
      const seededAt = new Date(Date.UTC(2026, 0, 1, 0, index));
      await database.bookmark.update({
        where: { id },
        data: { createdAt: seededAt, updatedAt: seededAt },
      });
    }
    const pendingIds = async () =>
      (await listBookmarks({ principalId: attendeeA, sessionId })).bookmarks
        .filter((b) => b.completeness === "pending")
        .map((b) => b.id);

    expect(await pendingIds()).toEqual(ids);
    fetchMock.mockImplementation(async (url) =>
      Response.json(
        syntheticSearchResponse(
          String(url).includes("simon-says-segments")
            ? [syntheticSegment({ sessionId, endMs: 40_000 })]
            : [],
        ),
      ),
    );

    const stillPending = await pendingIds();
    expect(stillPending).toHaveLength(1);
    expect(stillPending).not.toContain(ids[5]);
    expect(await pendingIds()).toEqual([]);
  });
});
