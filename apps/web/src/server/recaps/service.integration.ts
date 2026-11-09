import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createDatabaseClient } from "@simon-says/db/client";
import {
  createRecap,
  exportRecapMarkdown,
  generateRecap,
  getRecap,
} from "./service";
import { generateTakeaways } from "./model";
import { syntheticRecapOutput, syntheticRecapSelection } from "./fixtures";

vi.mock("server-only", () => ({}));
vi.mock("./model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model")>()),
  generateTakeaways: vi.fn(),
}));
const database = createDatabaseClient();
vi.mock("../access/database", () => ({ getDatabase: () => database }));
const host = randomUUID();
const attendeeA = randomUUID();
const attendeeB = randomUUID();
const sessionId = randomUUID();
const otherSessionId = randomUUID();
let selection = syntheticRecapSelection();
const model = vi.mocked(generateTakeaways);
const options = () => ({
  principalId: attendeeA,
  sessionId,
  request: {
    operationId: randomUUID(),
    bookmarks: [{ bookmarkId: selection.id, expectedRevision: 1 }],
  },
});

beforeAll(async () => {
  await database.principal.createMany({
    data: [host, attendeeA, attendeeB].map((id) => ({ id })),
  });
  for (const id of [sessionId, otherSessionId]) {
    await database.session.create({
      data: {
        id,
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
  }
});
beforeEach(async () => {
  vi.resetAllMocks();
  await database.recap.deleteMany({
    where: { sessionId: { in: [sessionId, otherSessionId] } },
  });
  await database.bookmark.deleteMany({ where: { sessionId } });
  await database.membership.updateMany({
    where: { sessionId },
    data: { revokedAt: null },
  });
  selection = syntheticRecapSelection();
  // Synthetic resolved evidence is inserted directly: Elasticsearch is unavailable.
  await database.bookmark.create({
    data: {
      id: selection.id,
      ownerPrincipalId: attendeeA,
      sessionId,
      operationId: randomUUID(),
      anchorKind: "live",
      markedAtMs: 3_000,
      requestedStartMs: 0,
      requestedEndMs: 3_000,
      clockUncertaintyMs: 0,
      completeness: "incomplete",
      evidence: selection.evidence,
      note: "Synthetic private note",
    },
  });
  model.mockResolvedValue(syntheticRecapOutput(selection.id));
});
afterAll(async () => {
  try {
    await database.session.deleteMany({
      where: { id: { in: [sessionId, otherSessionId] } },
    });
    await database.principal.deleteMany({
      where: { id: { in: [host, attendeeA, attendeeB] } },
    });
  } finally {
    await database.$disconnect();
  }
});

describe("recaps with real local Postgres and synthetic resolved evidence/model", () => {
  it("generates separate recaps that cite only each attendee's selections", async () => {
    const other = await database.bookmark.create({
      data: {
        ownerPrincipalId: attendeeB,
        sessionId,
        operationId: randomUUID(),
        anchorKind: "live",
        markedAtMs: 3_000,
        requestedStartMs: 0,
        requestedEndMs: 3_000,
        clockUncertaintyMs: 0,
        completeness: "incomplete",
        evidence: {
          segments: [
            {
              segmentId: "synthetic-attendee-B",
              revision: 1,
              range: { startMs: 1_000, endMs: 3_000 },
              text: "Synthetic attendee B kept deployment details.",
            },
          ],
        },
      },
    });
    model.mockImplementation(async ({ passages }) => ({
      takeaways: passages.map((passage) => ({
        text: passage.text,
        citations: [
          {
            bookmarkId: passage.bookmarkId,
            segmentId: passage.segmentId,
            segmentRevision: passage.segmentRevision,
            excerpt: passage.text,
          },
        ],
      })),
    }));
    const a = await createRecap(options());
    const b = await createRecap({
      principalId: attendeeB,
      sessionId,
      request: {
        operationId: randomUUID(),
        bookmarks: [{ bookmarkId: other.id, expectedRevision: 1 }],
      },
    });
    await generateRecap(a.response.id);
    await generateRecap(b.response.id);
    const recapA = await getRecap({
      principalId: attendeeA,
      id: a.response.id,
    });
    const recapB = await getRecap({
      principalId: attendeeB,
      id: b.response.id,
    });
    expect(recapA.status).toBe("ready");
    expect(recapB.status).toBe("ready");
    expect(recapA.takeaways[0]?.citations.map((c) => c.bookmarkId)).toEqual([
      selection.id,
    ]);
    expect(recapB.takeaways[0]?.citations.map((c) => c.bookmarkId)).toEqual([
      other.id,
    ]);
    expect(recapA.takeaways[0]?.text).not.toBe(recapB.takeaways[0]?.text);
  });

  it("persists pending, generates only selected citations, reads and exports", async () => {
    const {
      response: { id },
    } = await createRecap(options());
    expect(await getRecap({ principalId: attendeeA, id })).toMatchObject({
      status: "pending",
    });
    await generateRecap(id);
    const recap = await getRecap({ principalId: attendeeA, id });
    expect(recap.status).toBe("ready");
    expect(
      recap.takeaways.flatMap((t) => t.citations.map((c) => c.bookmarkId)),
    ).toEqual([selection.id]);
    expect(recap.takeaways[0]?.citations[0]).toMatchObject({
      range: { startMs: 1_000, endMs: 3_000 },
    });
    expect(await exportRecapMarkdown({ principalId: attendeeA, id })).toContain(
      `bookmark ${selection.id}`,
    );
    expect(
      await database.bookmark.findUnique({ where: { id: selection.id } }),
    ).toMatchObject({
      revision: 1,
      note: "Synthetic private note",
      evidence: selection.evidence,
    });
  });

  it("converges concurrent create retries on one operation and keeps it after edits", async () => {
    const request = options();
    const results = await Promise.all([
      createRecap(request),
      createRecap(request),
    ]);
    expect(results[0]?.response).toEqual(results[1]?.response);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await database.recap.count({ where: { sessionId } })).toBe(1);
    await database.bookmark.update({
      where: { id: selection.id },
      data: { revision: 2 },
    });
    expect((await createRecap(request)).response).toEqual(results[0]?.response);
  });

  it("allows one active recap per owner and session", async () => {
    const results = await Promise.allSettled([
      createRecap(options()),
      createRecap(options()),
    ]);
    const created = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    expect(created).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { status: 429, code: "recap_in_progress" } });
    expect(await database.recap.count({ where: { sessionId } })).toBe(1);

    await generateRecap(created[0]!.response.id);
    expect((await createRecap(options())).created).toBe(true);
  });

  it("hides other owners, host bypass, cross-session IDs and reused cross-session operations", async () => {
    const request = options();
    const {
      response: { id },
    } = await createRecap(request);
    for (const principalId of [attendeeB, host]) {
      await expect(getRecap({ principalId, id })).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        exportRecapMarkdown({ principalId, id }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        createRecap({ ...options(), principalId }),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      createRecap({ ...options(), sessionId: otherSessionId }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createRecap({ ...request, sessionId: otherSessionId }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns 409 for an owner's stale selection", async () => {
    await database.bookmark.update({
      where: { id: selection.id },
      data: { revision: 2 },
    });
    await expect(createRecap(options())).rejects.toMatchObject({
      body: { error: "revision_conflict", currentRevision: 2 },
    });
    expect(await database.recap.count({ where: { sessionId } })).toBe(0);
  });

  it("makes no model call for empty evidence and preserves the bookmark", async () => {
    await database.bookmark.update({
      where: { id: selection.id },
      data: { evidence: { segments: [] } },
    });
    const {
      response: { id },
    } = await createRecap(options());
    await generateRecap(id);
    expect(await getRecap({ principalId: attendeeA, id })).toMatchObject({
      status: "failed",
      failureReason: "no_resolved_evidence",
    });
    expect(model).not.toHaveBeenCalled();
    expect(await database.bookmark.count({ where: { id: selection.id } })).toBe(
      1,
    );
  });

  it("drops invalid citations and fails without touching selections", async () => {
    model.mockResolvedValue(syntheticRecapOutput(randomUUID()));
    const {
      response: { id },
    } = await createRecap(options());
    await generateRecap(id);
    expect(await getRecap({ principalId: attendeeA, id })).toMatchObject({
      status: "failed",
      failureReason: "no_valid_citations",
      takeaways: [],
    });
    expect(
      await database.bookmark.findUnique({ where: { id: selection.id } }),
    ).toMatchObject({ evidence: selection.evidence, revision: 1 });
  });

  it("detects an edit during generation and deletion after completion", async () => {
    model.mockImplementationOnce(async () => {
      await database.bookmark.update({
        where: { id: selection.id },
        data: { revision: 2 },
      });
      return syntheticRecapOutput(selection.id);
    });
    const {
      response: { id },
    } = await createRecap(options());
    await generateRecap(id);
    expect(await getRecap({ principalId: attendeeA, id })).toMatchObject({
      status: "stale",
      takeaways: [],
    });
    const second = await createRecap({
      ...options(),
      request: {
        ...options().request,
        bookmarks: [{ bookmarkId: selection.id, expectedRevision: 2 }],
      },
    });
    await generateRecap(second.response.id);
    expect(
      await getRecap({ principalId: attendeeA, id: second.response.id }),
    ).toMatchObject({ status: "ready" });
    await database.bookmark.delete({ where: { id: selection.id } });
    expect(
      await getRecap({ principalId: attendeeA, id: second.response.id }),
    ).toMatchObject({ status: "stale", takeaways: [] });
    expect(
      await exportRecapMarkdown({
        principalId: attendeeA,
        id: second.response.id,
      }),
    ).toBeNull();
  });

  it("keeps bookmarks usable after model errors and denies revoked reads", async () => {
    model.mockRejectedValue(
      new Error("Synthetic provider error containing private data"),
    );
    const {
      response: { id },
    } = await createRecap(options());
    await generateRecap(id);
    expect(await getRecap({ principalId: attendeeA, id })).toMatchObject({
      status: "failed",
      failureReason: "generation_failed",
    });
    expect(
      await database.bookmark.findUnique({ where: { id: selection.id } }),
    ).toMatchObject({ revision: 1, note: "Synthetic private note" });
    await database.membership.updateMany({
      where: { sessionId, principalId: attendeeA },
      data: { revokedAt: new Date() },
    });
    await expect(
      getRecap({ principalId: attendeeA, id }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(createRecap(options())).rejects.toMatchObject({ status: 404 });
  });

  it("cascades recaps when their session is removed", async () => {
    const copy = await database.bookmark.create({
      data: {
        ownerPrincipalId: attendeeA,
        sessionId: otherSessionId,
        operationId: randomUUID(),
        anchorKind: "live",
        markedAtMs: 1,
        requestedStartMs: 0,
        requestedEndMs: 1,
        clockUncertaintyMs: 0,
      },
    });
    const {
      response: { id },
    } = await createRecap({
      ...options(),
      sessionId: otherSessionId,
      request: {
        operationId: randomUUID(),
        bookmarks: [{ bookmarkId: copy.id, expectedRevision: 1 }],
      },
    });
    await database.session.delete({ where: { id: otherSessionId } });
    expect(await database.recap.findUnique({ where: { id } })).toBeNull();
  });
});
