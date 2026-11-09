import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { AccessError } from "../access/errors";
import { handleAsk } from "./http";

const { readPrincipal, askSession } = vi.hoisted(() => ({
  readPrincipal: vi.fn(),
  askSession: vi.fn(),
}));
vi.mock("../access/principal", () => ({
  readPrincipal,
  ensurePrincipal: vi.fn(),
}));
vi.mock("./service", () => ({ askSession }));
const sessionId = randomUUID();
const principalId = randomUUID();
const request = (question: unknown = "  Explain this idea  ") =>
  new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  readPrincipal.mockResolvedValue({ id: principalId });
  askSession.mockResolvedValue(
    new Response("answer", { headers: { "Cache-Control": "no-store" } }),
  );
});
it("passes trimmed input, signed identity and request cancellation to the service", async () => {
  const req = request();
  expect((await handleAsk(req, sessionId)).status).toBe(200);
  expect(askSession).toHaveBeenCalledWith({
    sessionId,
    principalId,
    question: "Explain this idea",
    signal: req.signal,
  });
});
it("returns 404 for non-members", async () => {
  askSession.mockRejectedValue(new AccessError(404, "not_found"));
  const response = await handleAsk(request(), sessionId);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("rejects missing identity and invalid session IDs with 404", async () => {
  expect((await handleAsk(request(), "bad")).status).toBe(404);
  expect(readPrincipal).not.toHaveBeenCalled();
  readPrincipal.mockResolvedValue(null);
  expect((await handleAsk(request(), sessionId)).status).toBe(404);
  expect(askSession).not.toHaveBeenCalled();
});
it.each(["", " ", "x".repeat(501), null, 123])(
  "validates the question",
  async (question) => {
    expect((await handleAsk(request(question), sessionId)).status).toBe(400);
    expect(askSession).not.toHaveBeenCalled();
  },
);
it("enforces JSON, valid syntax and the body-size limit", async () => {
  expect(
    (
      await handleAsk(
        new Request("http://localhost", { method: "POST", body: "{}" }),
        sessionId,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await handleAsk(
        new Request("http://localhost", {
          method: "POST",
          body: "{",
          headers: { "Content-Type": "application/json" },
        }),
        sessionId,
      )
    ).status,
  ).toBe(400);
  expect((await handleAsk(request("x".repeat(20_000)), sessionId)).status).toBe(
    413,
  );
  expect(askSession).not.toHaveBeenCalled();
});
it("keeps unexpected errors content-free", async () => {
  askSession.mockRejectedValue(new Error("PRIVATE_QUESTION_OR_ANSWER"));
  const response = await handleAsk(request(), sessionId);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "internal_error" });
});
