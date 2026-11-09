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
import { putBookmark } from "../bookmarks/service";
import { syntheticSearchResponse } from "../evidence/fixtures";
import { searchSession } from "./service";
import { searchBatch, searchHit } from "./fixtures";
import { syntheticSegment } from "../evidence/fixtures";

vi.mock("server-only", () => ({}));
const database = getDatabase();
const sessionId = randomUUID();
const host = randomUUID();
const attendee = randomUUID();
const outsider = randomUUID();
const fetchMock = vi.fn<typeof fetch>();
const options = {
  sessionId,
  principalId: attendee,
  request: { query: "Synthetic earlier concept", limit: 10 },
};
beforeAll(async () => {
  await database.principal.createMany({
    data: [host, attendee, outsider].map((id) => ({ id })),
  });
  await database.session.create({
    data: {
      id: sessionId,
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
  await database.session.update({
    where: { id: sessionId },
    data: { status: "live" },
  });
  await database.membership.updateMany({
    where: { sessionId },
    data: { revokedAt: null },
  });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () =>
    Response.json(searchBatch([searchHit(syntheticSegment({ sessionId }))])),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ELASTICSEARCH_URL", "https://synthetic-elastic.example");
  vi.stubEnv("ELASTICSEARCH_API_KEY", "synthetic-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  try {
    await database.session.deleteMany({ where: { id: sessionId } });
    await database.principal.deleteMany({
      where: { id: { in: [host, attendee, outsider] } },
    });
  } finally {
    await database.$disconnect();
  }
});
describe("search with real Postgres and synthetic ES HTTP", () => {
  it("allows a current member and denies an outsider before any ES request", async () => {
    expect(await searchSession(options)).toMatchObject({
      indexingState: "current",
      results: [{ segmentId: "segment-1" }],
    });
    fetchMock.mockClear();
    await expect(
      searchSession({ ...options, principalId: outsider }),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("saves a search result as a paragraph bookmark with its source times intact", async () => {
    const result = (await searchSession(options)).results[0];
    expect(result).toBeDefined();
    if (!result) throw new Error("Expected synthetic result");
    fetchMock.mockImplementation(async (url) =>
      Response.json(
        syntheticSearchResponse(
          String(url).includes("simon-says-segments")
            ? [syntheticSegment({ sessionId })]
            : [],
        ),
      ),
    );
    const anchor = {
      kind: "paragraph",
      segmentId: result.segmentId,
      segmentRevision: result.segmentRevision,
      range: result.range,
    } as const;
    const saved = await putBookmark({
      principalId: attendee,
      id: randomUUID(),
      request: {
        sessionId,
        operationId: randomUUID(),
        expectedRevision: null,
        anchor,
      },
    });
    expect(saved).toMatchObject({
      status: 201,
      bookmark: {
        anchor,
        requestedRange: result.range,
        evidence: { segments: [{ text: result.excerpt }] },
      },
    });
  });
  it("denies revoked membership before querying ES", async () => {
    await database.membership.updateMany({
      where: { sessionId, principalId: attendee },
      data: { revokedAt: new Date() },
    });
    await expect(searchSession(options)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rechecks revocation committed while ES was responding", async () => {
    fetchMock.mockImplementationOnce(async () => {
      await database.membership.updateMany({
        where: { sessionId, principalId: attendee },
        data: { revokedAt: new Date() },
      });
      return Response.json(
        searchBatch([searchHit(syntheticSegment({ sessionId }))]),
      );
    });
    await expect(searchSession(options)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("denies expired sessions before ES", async () => {
    await database.session.update({
      where: { id: sessionId },
      data: { status: "expired" },
    });
    await expect(searchSession(options)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
