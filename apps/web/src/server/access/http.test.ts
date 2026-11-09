import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "./errors";
import {
  handleClaimHost,
  handleCreateSession,
  handleJoinSession,
} from "./http";

vi.mock("server-only", () => ({}));
const { ensurePrincipal, createSession, joinSession, claimHost } = vi.hoisted(
  () => ({
    ensurePrincipal: vi.fn(),
    createSession: vi.fn(),
    joinSession: vi.fn(),
    claimHost: vi.fn(),
  }),
);
vi.mock("./principal", () => ({ ensurePrincipal }));
vi.mock("./sessions", () => ({ createSession, joinSession, claimHost }));

const principalId = randomUUID();
const sessionId = randomUUID();
const request = (body: unknown) =>
  new Request("http://localhost:3000/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  ensurePrincipal.mockResolvedValue({ id: principalId });
});

describe("access HTTP boundaries", () => {
  it("validates and trims the title before creating a session", async () => {
    createSession.mockResolvedValue({ sessionId });
    const response = await handleCreateSession(
      request({ title: "  My talk  " }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createSession).toHaveBeenCalledWith({
      principalId,
      request: { title: "My talk" },
    });
  });

  it("rejects bad JSON and invalid schemas without creating a principal", async () => {
    const badJson = new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    for (const invalid of [
      badJson,
      request({ title: "" }),
      request({ title: "x".repeat(121) }),
    ]) {
      const response = await handleCreateSession(invalid);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(ensurePrincipal).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared Content-Length before reading the body", async () => {
    const oversized = new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(16 * 1024 + 1),
      },
      body: JSON.stringify({ title: "Talk" }),
    });
    const response = await handleCreateSession(oversized);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(oversized.bodyUsed).toBe(false);
    expect(ensurePrincipal).not.toHaveBeenCalled();
  });

  it("caps streamed bodies that declare no Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(4096));
    const streamed = new Request("http://localhost/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        pull: (controller) => controller.enqueue(chunk),
      }),
      duplex: "half",
    } as RequestInit);
    expect(streamed.headers.get("content-length")).toBeNull();

    const response = await handleJoinSession(streamed);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
    expect(ensurePrincipal).not.toHaveBeenCalled();
  });

  it("keeps the 413 when cancelling an oversized stream fails", async () => {
    const chunk = new TextEncoder().encode("x".repeat(4096));
    const streamed = new Request("http://localhost/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        pull: (controller) => controller.enqueue(chunk),
        cancel: () => {
          throw new Error("cancel failed");
        },
      }),
      duplex: "half",
    } as RequestInit);

    const response = await handleJoinSession(streamed);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
  });

  it("treats an aborted upload as an invalid request", async () => {
    const aborted = new Request("http://localhost/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        pull: (controller) => controller.error(new Error("socket hang up")),
      }),
      duplex: "half",
    } as RequestInit);

    const response = await handleJoinSession(aborted);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(ensurePrincipal).not.toHaveBeenCalled();
  });

  it("accepts a normal body near the limit", async () => {
    createSession.mockResolvedValue({ sessionId });
    const padded = `{"title":"Talk","padding":"${"x".repeat(16_000)}"}`;
    const response = await handleCreateSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: padded,
      }),
    );
    expect(response.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith({
      principalId,
      request: { title: "Talk" },
    });
  });

  it("rejects malformed invite codes and non-UUID session IDs at the boundary", async () => {
    expect(
      (await handleJoinSession(request({ inviteCode: "bad" }))).status,
    ).toBe(400);
    expect(
      (await handleClaimHost(request({ token: "anything" }), "bad-id")).status,
    ).toBe(404);
    expect(ensurePrincipal).not.toHaveBeenCalled();
    expect(claimHost).not.toHaveBeenCalled();
  });

  it("requires a host token", async () => {
    const response = await handleClaimHost(request({}), sessionId);
    expect(response.status).toBe(400);
    expect(claimHost).not.toHaveBeenCalled();
  });

  it("preserves typed denials and never exposes unexpected error details", async () => {
    joinSession.mockRejectedValueOnce(new AccessError(409, "already_host"));
    const conflict = await handleJoinSession(
      request({ inviteCode: "a".repeat(32) }),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "already_host" });

    createSession.mockRejectedValueOnce(new Error("private database details"));
    const failure = await handleCreateSession(request({}));
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: "internal_error" });
    expect(failure.headers.get("cache-control")).toBe("no-store");
  });
});
