import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "../access/errors";
import { RevisionConflict } from "./service";
import {
  handleDeleteBookmark,
  handleListBookmarks,
  handlePutBookmark,
} from "./http";

vi.mock("server-only", () => ({}));
const { readPrincipal, putBookmark, listBookmarks, deleteBookmark } =
  vi.hoisted(() => ({
    readPrincipal: vi.fn(),
    putBookmark: vi.fn(),
    listBookmarks: vi.fn(),
    deleteBookmark: vi.fn(),
  }));
vi.mock("../access/principal", () => ({
  readPrincipal,
  ensurePrincipal: vi.fn(),
}));
vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  putBookmark,
  listBookmarks,
  deleteBookmark,
}));
const id = randomUUID();
const sessionId = randomUUID();
const principalId = randomUUID();
const body = {
  sessionId,
  operationId: randomUUID(),
  expectedRevision: null,
  anchor: { kind: "live", markedAtMs: 5000 },
};
const request = (value: unknown = body) =>
  new Request(`http://localhost/api/bookmarks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });

beforeEach(() => {
  vi.resetAllMocks();
  readPrincipal.mockResolvedValue({ id: principalId });
  putBookmark.mockResolvedValue({ bookmark: { id }, status: 201 });
  listBookmarks.mockResolvedValue({ bookmarks: [] });
});

const expectResponse = async (
  response: Response,
  status: number,
  result?: unknown,
) => {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  if (result !== undefined) expect(await response.json()).toEqual(result);
};

describe("bookmark HTTP boundaries", () => {
  it("parses the shared request and forwards only the signed principal", async () => {
    await expectResponse(await handlePutBookmark(request(), id), 201, { id });
    expect(putBookmark).toHaveBeenCalledWith({
      principalId,
      id,
      request: body,
    });
  });

  it("returns no-store on list and idempotent deletion", async () => {
    await expectResponse(
      await handleListBookmarks(
        new Request(`http://localhost/api/me/bookmarks?sessionId=${sessionId}`),
      ),
      200,
      { bookmarks: [] },
    );
    expect(listBookmarks).toHaveBeenCalledWith({ principalId, sessionId });
    await expectResponse(await handleDeleteBookmark(request(), id), 204);
    expect(deleteBookmark).toHaveBeenCalledWith({ principalId, id });
  });

  it("rejects non-UUID path and session IDs uniformly before invoking services", async () => {
    await expectResponse(await handlePutBookmark(request(), "invalid"), 404, {
      error: "not_found",
    });
    await expectResponse(await handleDeleteBookmark(request(), "invalid"), 404);
    await expectResponse(
      await handleListBookmarks(
        new Request("http://localhost/api/me/bookmarks?sessionId=invalid"),
      ),
      404,
    );
    expect(readPrincipal).not.toHaveBeenCalled();
  });

  it("uses the existing content-type, schema, and 16 KiB body checks", async () => {
    await expectResponse(
      await handlePutBookmark(request({ ...body, expectedRevision: 0 }), id),
      400,
      { error: "invalid_request" },
    );
    await expectResponse(
      await handlePutBookmark(
        request({ ...body, note: "x".repeat(20_000) }),
        id,
      ),
      413,
      { error: "payload_too_large" },
    );
    await expectResponse(
      await handlePutBookmark(
        new Request("http://localhost", { method: "PUT", body: "{}" }),
        id,
      ),
      400,
    );
    expect(putBookmark).not.toHaveBeenCalled();
  });

  it("rejects missing signed identity", async () => {
    readPrincipal.mockResolvedValue(null);
    await expectResponse(await handlePutBookmark(request(), id), 404, {
      error: "not_found",
    });
    expect(putBookmark).not.toHaveBeenCalled();
  });

  it("returns typed conflicts and access denials without leaking unexpected errors", async () => {
    const conflict = {
      error: "revision_conflict",
      id,
      expectedRevision: 1,
      currentRevision: 2,
    } as const;
    putBookmark.mockRejectedValueOnce(new RevisionConflict(conflict));
    await expectResponse(await handlePutBookmark(request(), id), 409, conflict);
    putBookmark.mockRejectedValueOnce(new AccessError(404, "not_found"));
    await expectResponse(await handlePutBookmark(request(), id), 404, {
      error: "not_found",
    });
    putBookmark.mockRejectedValueOnce(
      new Error("Synthetic private database detail"),
    );
    await expectResponse(await handlePutBookmark(request(), id), 500, {
      error: "internal_error",
    });
  });
});
