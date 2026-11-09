import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  bookmarkResponseSchema,
  listBookmarksResponseSchema,
} from "@simon-says/contracts/bookmark";
import {
  createRecapResponseSchema,
  recapResponseSchema,
} from "@simon-says/contracts/recap";
import { cookies } from "next/headers";
import { after } from "next/server";
import { getDatabase } from "../access/database";
import { principalCookieName, signPrincipal } from "../access/credentials";
import {
  handlePutBookmark,
  handleListBookmarks,
  handleDeleteBookmark,
} from "../bookmarks/http";
import { handleCreateRecap, handleGetRecap, handleExportRecap } from "./http";
import { generateTakeaways } from "./model";
import {
  syntheticSegment,
  syntheticObservation,
  syntheticSearchResponse,
} from "../evidence/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./model", async (original) => ({
  ...(await original<typeof import("./model")>()),
  generateTakeaways: vi.fn(),
}));

const database = getDatabase();
const sessionId = randomUUID();
const host = randomUUID();
const attendeeA = randomUUID();
const attendeeB = randomUUID();
const secret = "synthetic-local-isolation-secret-103";
const model = vi.mocked(generateTakeaways);
let background: (() => Promise<unknown>)[] = [];

const identity = (id: string | null) => {
  const value = id ? signPrincipal({ principalId: id, secret }) : undefined;
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === principalCookieName && value ? { name, value } : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
};
const request = (body?: unknown) =>
  new Request(`http://localhost/api/me/bookmarks?sessionId=${sessionId}`, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
const checked = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response;
};
const save = async (owner: string) => {
  identity(owner);
  const id = randomUUID();
  const body = {
    sessionId,
    operationId: randomUUID(),
    expectedRevision: null,
    anchor: { kind: "live", markedAtMs: 3000 },
    note: `Private note ${owner}`,
  };
  const response = await checked(
    await handlePutBookmark(request(body), id),
    201,
  );
  const bookmark = bookmarkResponseSchema.parse(await response.json());
  expect(bookmark.evidence.segments).toHaveLength(1);
  expect(bookmark.evidence.frames).toEqual([
    { frameId: "frame-0", capturedAtMs: 0, imageUrl: null },
  ]);
  return { id, body, bookmark };
};
const create = async (owner: string, bookmarkId: string) => {
  identity(owner);
  const response = await checked(
    await handleCreateRecap(
      request({
        operationId: randomUUID(),
        bookmarks: [{ bookmarkId, expectedRevision: 1 }],
      }),
      sessionId,
    ),
    201,
  );
  return createRecapResponseSchema.parse(await response.json()).id;
};
const drain = async () => {
  const jobs = background.splice(0);
  for (const job of jobs) await job();
};

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
        create: [host, attendeeA, attendeeB].map((principalId) => ({
          principalId,
          role: principalId === host ? "host" : "attendee",
        })),
      },
    },
  });
});
beforeEach(async () => {
  vi.resetAllMocks();
  background = [];
  vi.stubEnv("SESSION_SECRET", secret);
  vi.stubEnv("ELASTICSEARCH_URL", "https://synthetic-elastic.example");
  vi.stubEnv("ELASTICSEARCH_API_KEY", "synthetic-test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      Response.json(
        syntheticSearchResponse(
          String(url).includes("simon-says-segments")
            ? [syntheticSegment({ sessionId })]
            : String(init?.body).includes('"gt"')
              ? []
              : [{ ...syntheticObservation(), sessionId }],
        ),
      ),
    ),
  );
  vi.mocked(after).mockImplementation((task) => {
    if (typeof task !== "function")
      throw new Error("Expected an after callback");
    background.push(async () => task());
  });
  model.mockImplementation(async ({ passages }) => ({
    takeaways: passages.map((p) => ({
      text: p.text,
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
});
afterEach(async () => {
  await drain();
  await database.recap.deleteMany({ where: { sessionId } });
  await database.bookmark.deleteMany({ where: { sessionId } });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

it("isolates successful notes, frame references, cited recaps and exports through HTTP handlers and Postgres", async () => {
  const a = await save(attendeeA);
  const b = await save(attendeeB);
  for (const [owner, own] of [
    [attendeeA, a],
    [attendeeB, b],
  ] as const) {
    identity(owner);
    const listed = await checked(await handleListBookmarks(request()), 200);
    expect(
      listBookmarksResponseSchema
        .parse(await listed.json())
        .bookmarks.map((bookmark) => bookmark.id),
    ).toEqual([own.id]);
    const id = await create(owner, own.id);
    await drain();
    const read = await checked(await handleGetRecap(request(), id), 200);
    const recap = recapResponseSchema.parse(await read.json());
    expect(recap.status).toBe("ready");
    expect(
      recap.takeaways.flatMap((t) => t.citations.map((c) => c.bookmarkId)),
    ).toEqual([own.id]);
    expect(recap.takeaways[0]?.citations[0]?.frameId).toBe("frame-0");
    const exported = await checked(await handleExportRecap(request(), id), 200);
    expect(exported.headers.get("content-type")).toContain("text/markdown");
    expect(exported.headers.get("content-disposition")).toContain(
      `recap-${id}.md`,
    );
    const markdown = await exported.text();
    expect(markdown).toContain(own.id);
    expect(markdown).toContain("frame-0");
    expect(markdown).not.toContain("Private note");
    expect(markdown).not.toContain(owner === attendeeA ? b.id : a.id);

    for (const outsider of [
      owner === attendeeA ? attendeeB : attendeeA,
      host,
      null,
    ]) {
      identity(outsider);
      for (const response of [
        await handleGetRecap(request(), id),
        await handleExportRecap(request(), id),
        await handlePutBookmark(
          request({
            ...own.body,
            operationId: randomUUID(),
            expectedRevision: 1,
          }),
          own.id,
        ),
        await handleDeleteBookmark(request(), own.id),
        await handleCreateRecap(
          request({
            operationId: randomUUID(),
            bookmarks: [{ bookmarkId: own.id, expectedRevision: 1 }],
          }),
          sessionId,
        ),
      ]) {
        await checked(response, 404);
        expect(await response.json()).toEqual({ error: "not_found" });
      }
    }
    expect(
      await database.bookmark.findUnique({ where: { id: own.id } }),
    ).toMatchObject({ note: own.body.note, revision: 1 });
  }
  identity(host);
  const hostList = await checked(await handleListBookmarks(request()), 200);
  expect(
    listBookmarksResponseSchema.parse(await hostList.json()).bookmarks,
  ).toEqual([]);
  identity(null);
  await checked(await handleListBookmarks(request()), 404);
  expect(model).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(model.mock.calls)).not.toContain("Private note");
});

it.each(["edit", "delete"] as const)(
  "discards generation output after a concurrent owner %s and refuses export",
  async (action) => {
    const saved = await save(attendeeA);
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    model.mockImplementationOnce(async ({ passages }) => {
      entered();
      await paused;
      return {
        takeaways: passages.map((p) => ({
          text: p.text,
          citations: [
            {
              bookmarkId: p.bookmarkId,
              segmentId: p.segmentId,
              segmentRevision: p.segmentRevision,
              excerpt: p.text,
            },
          ],
        })),
      };
    });
    const id = await create(attendeeA, saved.id);
    const running = drain();
    try {
      await started;
      const pendingExport = await checked(
        await handleExportRecap(request(), id),
        409,
      );
      expect(await pendingExport.json()).toEqual({ error: "recap_not_ready" });
      expect(await database.recap.findUnique({ where: { id } })).toMatchObject({
        status: "running",
      });
      if (action === "edit") {
        await checked(
          await handlePutBookmark(
            request({
              ...saved.body,
              operationId: randomUUID(),
              expectedRevision: 1,
              note: "Changed during generation",
            }),
            saved.id,
          ),
          200,
        );
      } else {
        await checked(await handleDeleteBookmark(request(), saved.id), 204);
      }
    } finally {
      release();
      await running;
    }
    expect(await database.recap.findUnique({ where: { id } })).toMatchObject({
      status: "stale",
      takeaways: [],
    });
    const read = await checked(await handleGetRecap(request(), id), 200);
    expect(recapResponseSchema.parse(await read.json())).toMatchObject({
      status: "stale",
      takeaways: [],
    });
    const exported = await checked(await handleExportRecap(request(), id), 409);
    expect(await exported.json()).toEqual({ error: "recap_not_ready" });
  },
);
