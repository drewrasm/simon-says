import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { after } from "next/server";
import {
  createRecap,
  exportRecapMarkdown,
  generateRecap,
  getRecap,
} from "./service";
import { handleCreateRecap, handleExportRecap, handleGetRecap } from "./http";
import { readPrincipal } from "../access/principal";
import { requireMembership } from "../access/membership";
import { AccessError } from "../access/errors";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./service", () => ({
  createRecap: vi.fn(),
  exportRecapMarkdown: vi.fn(),
  generateRecap: vi.fn(),
  getRecap: vi.fn(),
}));
vi.mock("../access/principal", () => ({ readPrincipal: vi.fn() }));
vi.mock("../access/membership", () => ({ requireMembership: vi.fn() }));
const sessionId = randomUUID();
const principalId = randomUUID();
const id = randomUUID();
const body = {
  operationId: randomUUID(),
  bookmarks: [{ bookmarkId: randomUUID(), expectedRevision: 1 }],
};
const request = (payload: unknown = body) =>
  new Request("http://localhost/api/sessions/session/recaps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readPrincipal).mockResolvedValue({ id: principalId });
  vi.mocked(createRecap).mockResolvedValue({ response: { id }, created: true });
  vi.mocked(generateRecap).mockResolvedValue(undefined);
  vi.mocked(getRecap).mockResolvedValue({
    id,
    status: "pending",
    takeaways: [],
    failureReason: null,
  });
});

it("returns the persisted ID and schedules generation after the response", async () => {
  const response = await handleCreateRecap(request(), sessionId);
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ id });
  expect(generateRecap).not.toHaveBeenCalled();
  expect(after).toHaveBeenCalledOnce();
  const task = vi.mocked(after).mock.calls[0]?.[0];
  if (typeof task !== "function") throw new Error("Expected an after callback");
  await task();
  expect(generateRecap).toHaveBeenCalledWith(id);
});

it("does not schedule duplicate work for an operation retry", async () => {
  vi.mocked(createRecap).mockResolvedValue({
    response: { id },
    created: false,
  });
  const response = await handleCreateRecap(request(), sessionId);
  expect(response.status).toBe(200);
  expect(after).not.toHaveBeenCalled();
});

it("does not leak a background database error through Next's task logger", async () => {
  vi.mocked(generateRecap).mockRejectedValue(
    new Error("Synthetic private database error"),
  );
  await handleCreateRecap(request(), sessionId);
  const task = vi.mocked(after).mock.calls[0]?.[0];
  if (typeof task !== "function") throw new Error("Expected an after callback");
  await expect(task()).resolves.toBeUndefined();
});

it("rejects malformed IDs uniformly before reading bodies or creating work", async () => {
  for (const handler of [
    handleCreateRecap,
    handleGetRecap,
    handleExportRecap,
  ]) {
    const response = await handler(request(), "malformed");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(createRecap).not.toHaveBeenCalled();
});

it("checks membership before parsing and rejects an empty selection without work", async () => {
  vi.mocked(requireMembership).mockRejectedValueOnce(
    new AccessError(404, "not_found"),
  );
  expect((await handleCreateRecap(request({}), sessionId)).status).toBe(404);
  expect(
    (await handleCreateRecap(request({ ...body, bookmarks: [] }), sessionId))
      .status,
  ).toBe(400);
  expect(createRecap).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});

it("hides missing identity and cross-owner reads and exports with no-store", async () => {
  vi.mocked(readPrincipal).mockResolvedValue(null);
  for (const handler of [
    handleCreateRecap,
    handleGetRecap,
    handleExportRecap,
  ]) {
    const response = await handler(request(), sessionId);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  vi.mocked(readPrincipal).mockResolvedValue({ id: principalId });
  vi.mocked(getRecap).mockRejectedValue(new AccessError(404, "not_found"));
  vi.mocked(exportRecapMarkdown).mockRejectedValue(
    new AccessError(404, "not_found"),
  );
  expect((await handleGetRecap(request(), id)).status).toBe(404);
  expect((await handleExportRecap(request(), id)).status).toBe(404);
});

it("returns validated status and a Markdown attachment, rejecting unfinished exports", async () => {
  const status = await handleGetRecap(request(), id);
  expect(await status.json()).toEqual({
    id,
    status: "pending",
    takeaways: [],
    failureReason: null,
  });
  expect(status.headers.get("cache-control")).toBe("no-store");
  vi.mocked(exportRecapMarkdown).mockResolvedValue(null);
  expect((await handleExportRecap(request(), id)).status).toBe(409);
  vi.mocked(exportRecapMarkdown).mockResolvedValue("# My recap\n");
  const exported = await handleExportRecap(request(), id);
  expect(exported.headers.get("content-type")).toBe(
    "text/markdown; charset=utf-8",
  );
  expect(exported.headers.get("cache-control")).toBe("no-store");
  expect(exported.headers.get("content-disposition")).toContain(
    `recap-${id}.md`,
  );
  expect(await exported.text()).toBe("# My recap\n");
});
