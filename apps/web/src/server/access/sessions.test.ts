import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "./credentials";
import { claimHost, createSession, joinSession } from "./sessions";

vi.mock("server-only", () => ({}));
const { sessionCreate, sessionFindUnique, membershipUpsert } = vi.hoisted(
  () => ({
    sessionCreate: vi.fn(),
    sessionFindUnique: vi.fn(),
    membershipUpsert: vi.fn(),
  }),
);
vi.mock("./database", () => {
  const database = {
    session: { create: sessionCreate, findUnique: sessionFindUnique },
    membership: { upsert: membershipUpsert },
  };
  return {
    getDatabase: () => ({
      ...database,
      $transaction: (run: (client: typeof database) => unknown) =>
        run(database),
    }),
  };
});

const principalId = randomUUID();
const sessionId = randomUUID();
const hostToken = "valid-host-token-with-enough-length";
const inviteCode = "a".repeat(32);
const liveSession = {
  id: sessionId,
  status: "live",
  endedAt: null,
  hostLinkTokenHash: hashToken(hostToken),
};
const membership = (overrides: object = {}) => ({
  id: randomUUID(),
  sessionId,
  principalId,
  role: "attendee",
  revokedAt: null,
  ...overrides,
});

beforeEach(() => vi.resetAllMocks());

describe("createSession", () => {
  it("stores only the host-token hash and returns the token in the URL fragment", async () => {
    sessionCreate.mockResolvedValue({ id: sessionId });

    const response = await createSession({
      principalId,
      request: { title: "Talk" },
    });

    const token = response.hostPath.split("#token=")[1] ?? "";
    expect(response.hostPath).toBe(`/host/${sessionId}#token=${token}`);
    expect(response.joinPath).toBe(`/join/${response.inviteCode}`);
    expect(sessionCreate).toHaveBeenCalledWith({
      data: {
        title: "Talk",
        hostPrincipalId: principalId,
        hostLinkTokenHash: hashToken(token),
        inviteCode: response.inviteCode,
        memberships: { create: { principalId, role: "host" } },
      },
    });
  });
});

describe("joinSession", () => {
  it("admits an attendee without granting host", async () => {
    sessionFindUnique.mockResolvedValue(liveSession);
    const attendee = membership();
    membershipUpsert.mockResolvedValue(attendee);

    await expect(joinSession({ principalId, inviteCode })).resolves.toEqual({
      sessionId,
      membershipId: attendee.id,
      role: "attendee",
    });
    expect(membershipUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { sessionId, principalId, role: "attendee" },
        update: {},
      }),
    );
  });

  it.each([
    ["unknown invitation", null],
    ["ended session", { ...liveSession, status: "ended" }],
    ["ended timestamp", { ...liveSession, endedAt: new Date() }],
    ["expired session", { ...liveSession, status: "expired" }],
  ])("denies an %s with 404", async (_case, session) => {
    sessionFindUnique.mockResolvedValue(session);

    await expect(
      joinSession({ principalId, inviteCode }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(membershipUpsert).not.toHaveBeenCalled();
  });

  it("denies a revoked membership with 404", async () => {
    sessionFindUnique.mockResolvedValue(liveSession);
    membershipUpsert.mockResolvedValue(membership({ revokedAt: new Date() }));

    await expect(
      joinSession({ principalId, inviteCode }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("rejects an existing host with 409", async () => {
    sessionFindUnique.mockResolvedValue(liveSession);
    membershipUpsert.mockResolvedValue(membership({ role: "host" }));

    await expect(
      joinSession({ principalId, inviteCode }),
    ).rejects.toMatchObject({ status: 409, code: "already_host" });
  });
});

describe("claimHost", () => {
  it("grants host membership with the matching token", async () => {
    sessionFindUnique.mockResolvedValue(liveSession);
    const host = membership({ role: "host" });
    membershipUpsert.mockResolvedValue(host);

    await expect(
      claimHost({ principalId, sessionId, token: hostToken }),
    ).resolves.toEqual({ sessionId, membershipId: host.id, role: "host" });
    expect(membershipUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { sessionId, principalId, role: "host" },
        update: { role: "host" },
      }),
    );
  });

  it("denies a wrong token with the same 404 as an unknown session", async () => {
    sessionFindUnique.mockResolvedValue(liveSession);

    await expect(
      claimHost({ principalId, sessionId, token: "wrong-token" }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(membershipUpsert).not.toHaveBeenCalled();
  });

  it("denies a revoked member even with the matching token", async () => {
    sessionFindUnique.mockResolvedValue(liveSession);
    membershipUpsert.mockResolvedValue(
      membership({ role: "host", revokedAt: new Date() }),
    );

    await expect(
      claimHost({ principalId, sessionId, token: hostToken }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });
});
