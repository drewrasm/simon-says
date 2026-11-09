import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createDatabaseClient } from "@simon-says/db/client";
import { createRecap, generateRecap, getRecap } from "./service";
import { generateTakeaways } from "./model";
import { getJobs, startJobs, stopJobs } from "../jobs/runtime";
import { recapQueue } from "./queue";
import { createRecapQueues } from "./worker";

vi.mock("server-only", () => ({}));
vi.mock("./model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model")>()),
  generateTakeaways: vi.fn(),
}));
const database = createDatabaseClient();
vi.mock("../access/database", () => ({ getDatabase: () => database }));
const host = randomUUID();
const attendee = randomUUID();
const sessionId = randomUUID();
const model = vi.mocked(generateTakeaways);
// Workers stay off so each test runs its attempt itself.
const finalAttempt = {
  signal: new AbortController().signal,
  retryCount: 2,
};
const removeRecaps = async () => {
  const recaps = await database.recap.findMany({
    where: { sessionId },
    select: { id: true },
  });
  const ids = recaps.map((recap) => recap.id);
  if (ids.length) await getJobs().deleteJob(recapQueue, ids);
  await database.recap.deleteMany({ where: { id: { in: ids } } });
};

type Segment = { segmentId: string; startMs: number; endMs: number };
const segmentText = (segmentId: string) => `Synthetic speech for ${segmentId}.`;

// Synthetic resolved evidence is inserted directly: Elasticsearch is unavailable.
const saveBookmark = (
  anchor: { markedAtMs: number } | { segmentId: string },
  segments: Segment[],
) =>
  database.bookmark.create({
    data: {
      ownerPrincipalId: attendee,
      sessionId,
      operationId: randomUUID(),
      ...("markedAtMs" in anchor
        ? { anchorKind: "live", markedAtMs: anchor.markedAtMs }
        : {
            anchorKind: "paragraph",
            segmentId: anchor.segmentId,
            segmentRevision: 1,
          }),
      requestedStartMs: segments[0]!.startMs,
      requestedEndMs: segments.at(-1)!.endMs,
      clockUncertaintyMs: 0,
      completeness: "complete",
      evidence: {
        segments: segments.map(({ segmentId, startMs, endMs }) => ({
          segmentId,
          revision: 1,
          range: { startMs, endMs },
          text: segmentText(segmentId),
        })),
        frames: [],
      },
      note: "Synthetic private note",
    },
  });

const recapOf = async (bookmarkIds: string[]) => {
  const { response } = await createRecap({
    principalId: attendee,
    sessionId,
    request: {
      operationId: randomUUID(),
      bookmarks: bookmarkIds.map((bookmarkId) => ({
        bookmarkId,
        expectedRevision: 1,
      })),
    },
  });
  await generateRecap(response.id, finalAttempt);
  return getRecap({ principalId: attendee, id: response.id });
};

beforeAll(async () => {
  await startJobs({
    connectionString: process.env.DATABASE_URL!,
    register: createRecapQueues,
  });
  await database.principal.createMany({
    data: [host, attendee].map((id) => ({ id })),
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
          { principalId: attendee, role: "attendee" },
        ],
      },
    },
  });
});
beforeEach(async () => {
  vi.resetAllMocks();
  await removeRecaps();
  await database.bookmark.deleteMany({ where: { sessionId } });
});
afterAll(async () => {
  try {
    await removeRecaps();
    await database.session.deleteMany({ where: { id: sessionId } });
    await database.principal.deleteMany({
      where: { id: { in: [host, attendee] } },
    });
  } finally {
    await stopJobs(1000);
    await database.$disconnect();
  }
});

it("sends and cites a passage saved from search beside a live clip", async () => {
  const passageRange = { startMs: 28_005.969, endMs: 33_120.25 };
  const clip = await saveBookmark({ markedAtMs: 18_000 }, [
    { segmentId: "synthetic-volcano", startMs: 2_000, endMs: 17_000 },
  ]);
  const passage = await saveBookmark({ segmentId: "synthetic-honeybee" }, [
    { segmentId: "synthetic-honeybee", ...passageRange },
  ]);
  model.mockImplementation(async ({ passages }) => ({
    takeaways: passages.map((p) => ({
      text: `Synthetic takeaway for ${p.segmentId}`,
      citations: [
        {
          bookmarkId: p.bookmarkId,
          segmentId: p.segmentId,
          segmentRevision: p.segmentRevision,
          excerpt: p.text,
        },
      ],
    })),
  }));

  const recap = await recapOf([clip.id, passage.id]);

  expect(model.mock.calls[0]?.[0].passages.map((p) => p.bookmarkId)).toEqual([
    clip.id,
    passage.id,
  ]);
  expect(recap.status).toBe("ready");
  expect(recap.takeaways.flatMap((t) => t.citations)).toEqual([
    expect.objectContaining({ bookmarkId: clip.id }),
    expect.objectContaining({ bookmarkId: passage.id, range: passageRange }),
  ]);
});

it("sends a shared segment once and lets every bookmark that holds it cite it", async () => {
  const shared = {
    segmentId: "synthetic-press",
    startMs: 44_000,
    endMs: 58_000,
  };
  const first = await saveBookmark({ markedAtMs: 58_000 }, [
    { segmentId: "synthetic-before", startMs: 28_000, endMs: 44_000 },
    shared,
  ]);
  const second = await saveBookmark({ markedAtMs: 74_000 }, [
    shared,
    { segmentId: "synthetic-after", startMs: 58_000, endMs: 74_000 },
  ]);
  const nested = await saveBookmark({ segmentId: shared.segmentId }, [shared]);
  const selected = [first.id, second.id, nested.id];
  model.mockResolvedValue({
    takeaways: [
      {
        text: "Synthetic takeaway for the shared section",
        citations: selected.map((bookmarkId) => ({
          bookmarkId,
          segmentId: shared.segmentId,
          segmentRevision: 1,
          excerpt: segmentText(shared.segmentId),
        })),
      },
    ],
  });

  const recap = await recapOf(selected);

  const passage = (bookmarkId: string, segmentId: string) => ({
    bookmarkId,
    segmentId,
    segmentRevision: 1,
    text: segmentText(segmentId),
  });
  expect(model.mock.calls[0]?.[0].passages).toEqual([
    passage(first.id, "synthetic-before"),
    {
      ...passage(first.id, shared.segmentId),
      alsoBookmarkIds: [second.id, nested.id],
    },
    passage(second.id, "synthetic-after"),
  ]);
  expect(recap.takeaways[0]?.citations.map((c) => c.bookmarkId)).toEqual(
    selected,
  );
});
