import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSearch } from "./http";
import { AccessError } from "../access/errors";

vi.mock("server-only", () => ({}));
const { readPrincipal, searchSession } = vi.hoisted(() => ({
  readPrincipal: vi.fn(),
  searchSession: vi.fn(),
}));
vi.mock("../access/principal", () => ({
  readPrincipal,
  ensurePrincipal: vi.fn(),
}));
vi.mock("./service", () => ({ searchSession }));
const sessionId = randomUUID();
const principalId = randomUUID();
const request = (body: unknown = { query: "  earlier idea  " }) =>
  new Request(`http://localhost/api/sessions/${sessionId}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const expectResponse = async (
  response: Response,
  status: number,
  body?: unknown,
) => {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  if (body) expect(await response.json()).toEqual(body);
};
beforeEach(() => {
  vi.resetAllMocks();
  readPrincipal.mockResolvedValue({ id: principalId });
  searchSession.mockResolvedValue({
    results: [],
    nextCursor: null,
    indexingState: "current",
  });
});
describe("search HTTP boundary", () => {
  it("trims the POST query, applies default limit and uses the signed principal", async () => {
    await expectResponse(await handleSearch(request(), sessionId), 200);
    expect(searchSession).toHaveBeenCalledWith({
      sessionId,
      principalId,
      request: { query: "earlier idea", limit: 10 },
    });
  });
  it("rejects non-UUID paths before reading identity", async () => {
    await expectResponse(await handleSearch(request(), "bad"), 404, {
      error: "not_found",
    });
    expect(readPrincipal).not.toHaveBeenCalled();
  });
  it("denies unsigned identity", async () => {
    readPrincipal.mockResolvedValue(null);
    await expectResponse(await handleSearch(request(), sessionId), 404);
    expect(searchSession).not.toHaveBeenCalled();
  });
  it.each([
    { query: " " },
    { query: "a".repeat(501) },
    { query: "idea", limit: 21 },
    { query: "idea", cursor: "a".repeat(201) },
  ])("validates the shared schema: %j", async (body) => {
    await expectResponse(await handleSearch(request(body), sessionId), 400);
    expect(searchSession).not.toHaveBeenCalled();
  });
  it("enforces JSON and the shared 16 KiB stream limit", async () => {
    await expectResponse(
      await handleSearch(request({ query: "a".repeat(20000) }), sessionId),
      413,
    );
    await expectResponse(
      await handleSearch(
        new Request("http://localhost", { method: "POST", body: "{}" }),
        sessionId,
      ),
      400,
    );
    expect(searchSession).not.toHaveBeenCalled();
  });
  it("returns unavailable as 200 and keeps all errors content-free", async () => {
    const unavailable = {
      results: [],
      nextCursor: null,
      indexingState: "unavailable",
    };
    searchSession.mockResolvedValueOnce(unavailable);
    await expectResponse(
      await handleSearch(request(), sessionId),
      200,
      unavailable,
    );
    searchSession.mockRejectedValueOnce(new AccessError(404, "not_found"));
    await expectResponse(await handleSearch(request(), sessionId), 404, {
      error: "not_found",
    });
    searchSession.mockRejectedValueOnce(new Error("Synthetic private detail"));
    await expectResponse(await handleSearch(request(), sessionId), 500, {
      error: "internal_error",
    });
  });
});
