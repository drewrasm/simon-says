import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createToken,
  hashToken,
  readSessionSecret,
  requiresSecureCookie,
  signPrincipal,
  verifyHostToken,
  verifyPrincipal,
} from "./credentials";

vi.mock("server-only", () => ({}));

const secret = "test-only-secret-with-at-least-32-characters";
const principalId = randomUUID();

afterEach(() => vi.unstubAllEnvs());

describe("device credentials", () => {
  it("round trips a signed principal with the correct secret", () => {
    const value = signPrincipal({ principalId, secret });
    expect(verifyPrincipal({ value, secret })).toBe(principalId);
  });

  it("rejects a tampered principal and a different signing secret", () => {
    const value = signPrincipal({ principalId, secret });
    expect(
      verifyPrincipal({
        value: value.replace(principalId, randomUUID()),
        secret,
      }),
    ).toBeNull();
    expect(verifyPrincipal({ value, secret: `${secret}-other` })).toBeNull();
  });

  it.each([
    undefined,
    "",
    "invalid",
    `${principalId}.x`,
    `${principalId}.${"a".repeat(44)}`,
    `${principalId}.${"a".repeat(43)}.extra`,
  ])("rejects absent or malformed credentials: %s", (value) =>
    expect(verifyPrincipal({ value, secret })).toBeNull(),
  );

  it("rejects malformed IDs even if their signature is valid", () => {
    const value = signPrincipal({ principalId: "invalid-id", secret });
    expect(verifyPrincipal({ value, secret })).toBeNull();
  });

  it.each([undefined, "", "too-short"])(
    "requires a configured secret of at least 32 characters",
    (value) => {
      vi.stubEnv("SESSION_SECRET", value);
      expect(readSessionSecret).toThrow(
        "SESSION_SECRET must contain at least 32 characters.",
      );
    },
  );

  it("accepts a configured secret at the minimum length", () => {
    vi.stubEnv("SESSION_SECRET", "a".repeat(32));
    expect(readSessionSecret()).toBe("a".repeat(32));
  });

  it("generates contract-safe tokens and verifies only the matching hash", () => {
    const token = createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(createToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyHostToken({ token, tokenHash: hashToken(token) })).toBe(true);
    expect(
      verifyHostToken({ token: createToken(), tokenHash: hashToken(token) }),
    ).toBe(false);
    expect(verifyHostToken({ token, tokenHash: "bad-hash" })).toBe(false);
  });

  it.each([
    ["http://localhost:3000", false],
    ["http://127.0.0.1:3000", false],
    ["http://[::1]:3000", false],
    ["https://localhost:3000", true],
    ["http://simon-says.cnh.radarhq.io", true],
    ["https://simon-says.cnh.radarhq.io", true],
  ])("uses secure cookies for %s: %s", (url, secure) => {
    expect(requiresSecureCookie(url)).toBe(secure);
  });
});
