import { describe, expect, it } from "vitest";
import { requestJoin } from "./request-join";

const inviteCode = "abcdefghijklmnop";
const sessionId = "6f1c1f7e-3d0e-4c1e-9a7a-2f5b8c6d9e01";

const reply =
  (status: number, body: unknown): typeof fetch =>
  async () =>
    Response.json(body, { status });

describe("requestJoin", () => {
  it("posts the invitation as JSON", async () => {
    let sent: RequestInit | undefined;
    await requestJoin({ inviteCode }, async (_url, init) => {
      sent = init;
      return Response.json({}, { status: 500 });
    });
    expect(sent?.method).toBe("POST");
    expect(new Headers(sent?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(sent?.body))).toEqual({ inviteCode });
  });

  it("returns the session on a valid join", async () => {
    const result = await requestJoin(
      { inviteCode },
      reply(200, {
        sessionId,
        membershipId: "0b8f3c52-41f7-4d3a-8f0e-7a1e2c3d4b5f",
        role: "attendee",
      }),
    );
    expect(result).toEqual({ kind: "joined", sessionId });
  });

  it("maps 409 to already_host", async () => {
    const result = await requestJoin(
      { inviteCode },
      reply(409, { error: "already_host" }),
    );
    expect(result).toEqual({ kind: "already_host" });
  });

  it("treats 404 and 400 as an invalid invitation", async () => {
    for (const status of [404, 400]) {
      const result = await requestJoin(
        { inviteCode },
        reply(status, { error: "x" }),
      );
      expect(result).toEqual({ kind: "not_found" });
    }
  });

  it("rejects a 200 body that does not match the contract", async () => {
    const result = await requestJoin(
      { inviteCode },
      reply(200, { sessionId: "nope" }),
    );
    expect(result).toEqual({ kind: "error" });
  });

  it("reports network failures as a retryable error", async () => {
    const result = await requestJoin({ inviteCode }, async () => {
      throw new TypeError("offline");
    });
    expect(result).toEqual({ kind: "error" });
  });
});
