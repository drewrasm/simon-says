import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireMembership } from "./membership";

vi.mock("server-only", () => ({}));
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("./database", () => ({
  getDatabase: () => ({ membership: { findUnique } }),
}));

const sessionId = randomUUID();
const principalId = randomUUID();
const membership = {
  id: randomUUID(),
  sessionId,
  principalId,
  role: "attendee",
  revokedAt: null,
  session: { status: "live" },
};

beforeEach(() => findUnique.mockReset());

describe("requireMembership", () => {
  it("returns current membership and permits ended-session reads", async () => {
    findUnique.mockResolvedValue({
      ...membership,
      session: { status: "ended" },
    });
    await expect(
      requireMembership({ sessionId, principalId }),
    ).resolves.toMatchObject({
      id: membership.id,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { sessionId_principalId: { sessionId, principalId } },
      include: { session: { omit: { hostLinkTokenHash: true } } },
    });
  });

  it.each([
    null,
    { ...membership, revokedAt: new Date() },
    { ...membership, session: { status: "expired" } },
  ])("uniformly denies absent, revoked, or expired access", async (record) => {
    findUnique.mockResolvedValue(record);
    await expect(
      requireMembership({ sessionId, principalId }),
    ).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });

  it("does not let an attendee pass a host check", async () => {
    findUnique.mockResolvedValue(membership);
    await expect(
      requireMembership({ sessionId, principalId, role: "host" }),
    ).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });

  it("accepts a current host", async () => {
    findUnique.mockResolvedValue({ ...membership, role: "host" });
    await expect(
      requireMembership({ sessionId, principalId, role: "host" }),
    ).resolves.toMatchObject({
      role: "host",
    });
  });

  it.each([
    { sessionId: "bad-id", principalId },
    { sessionId, principalId: "bad-id" },
    { sessionId, principalId: null },
  ])("denies invalid identifiers before reaching Prisma", async (options) => {
    await expect(requireMembership(options)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
