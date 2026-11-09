import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { principalCookieName, signPrincipal } from "./credentials";
import { ensurePrincipal, readPrincipal } from "./principal";

vi.mock("server-only", () => ({}));
const { getCookie, setCookie, upsert } = vi.hoisted(() => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: getCookie, set: setCookie }),
}));
vi.mock("./database", () => ({
  getDatabase: () => ({ principal: { upsert } }),
}));

const secret = "test-only-secret-with-at-least-32-characters";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", secret);
});
afterEach(() => vi.unstubAllEnvs());

describe("device principal", () => {
  it("reads without creating a principal or cookie", async () => {
    expect(await readPrincipal()).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("returns only a verified principal", async () => {
    const id = randomUUID();
    getCookie.mockReturnValue({
      value: signPrincipal({ principalId: id, secret }),
    });
    expect(await readPrincipal()).toEqual({ id });
    getCookie.mockReturnValue({ value: "tampered-cookie" });
    expect(await readPrincipal()).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fails on missing server configuration before writing identity", async () => {
    vi.stubEnv("SESSION_SECRET", undefined);
    await expect(ensurePrincipal({ secureCookie: true })).rejects.toThrow(
      "SESSION_SECRET",
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("creates and signs an identity on the first mutation", async () => {
    const principal = await ensurePrincipal({ secureCookie: true });
    expect(upsert).toHaveBeenCalledWith({
      where: { id: principal.id },
      create: { id: principal.id },
      update: {},
    });
    expect(setCookie).toHaveBeenCalledWith(
      principalCookieName,
      signPrincipal({ principalId: principal.id, secret }),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      },
    );
  });

  it("preserves the identity on later mutations", async () => {
    const id = randomUUID();
    getCookie.mockReturnValue({
      value: signPrincipal({ principalId: id, secret }),
    });
    expect(await ensurePrincipal({ secureCookie: false })).toEqual({ id });
    expect(setCookie).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith({
      where: { id },
      create: { id },
      update: {},
    });
  });
});
