import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { principalCookieName, signPrincipal } from "../access/credentials";
import { AccessError } from "../access/errors";
import { createIngestAuthority } from "../captions/access-authority";
import { createFrameAccess } from "./access-authority";
import { FrameTransport } from "./transport";
import {
  createFrameUpload,
  InMemoryObservationSink,
  ObservationConflictError,
} from "./upload";
import { readRuntimeEnv } from "../../../server/env";

const access = vi.hoisted(() => ({
  requireMembership: vi.fn(
    async (_options: {
      sessionId: string;
      principalId: string | null;
      role?: string;
    }) => {
      void _options;
      return { session: { status: "live" } };
    },
  ),
}));
vi.mock("../access/membership", () => access);
const sessionId = "11111111-1111-4111-8111-111111111111";
const hostId = "22222222-2222-4222-8222-222222222222";
const attendeeId = "33333333-3333-4333-8333-333333333333";
const secret = "synthetic-test-session-secret-32-characters";
const origin = "https://simon.example";
const env = {
  NODE_ENV: "production",
  DATABASE_URL: "configured",
  APP_ORIGIN: origin,
};
let revoked = false;
let status = "live";
function cookie(id = hostId) {
  return `${principalCookieName}=${encodeURIComponent(signPrincipal({ principalId: id, secret }))}`;
}
function request(
  value: string | undefined = cookie(),
  source: string | undefined = origin,
) {
  const headers = new Headers();
  if (value !== undefined) headers.set("Cookie", value);
  if (source !== undefined) headers.set("Origin", source);
  return new Request(origin, { headers });
}
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", secret);
  revoked = false;
  status = "live";
  access.requireMembership.mockReset();
  access.requireMembership.mockImplementation(async (options) => {
    if (
      revoked ||
      status === "expired" ||
      options.sessionId !== sessionId ||
      options.principalId !== hostId ||
      options.role !== "host"
    )
      throw new AccessError(404, "not_found");
    return { session: { status } };
  });
});
afterEach(() => vi.unstubAllEnvs());

it("reuses signed cookie verification and host membership, denying all invalid identities", async () => {
  const frames = createFrameAccess(
    env,
    "http://localhost",
    createIngestAuthority(env),
  );
  expect(await frames.authorize(request(), sessionId, 1, "10.0.0.1")).toBe(
    "allowed",
  );
  expect(access.requireMembership).toHaveBeenLastCalledWith({
    sessionId,
    principalId: hostId,
    role: "host",
  });
  for (const value of [
    cookie(attendeeId),
    cookie("44444444-4444-4444-8444-444444444444"),
    cookie() + "forged",
    "",
    `${principalCookieName}=%ZZ`,
    `${cookie()}; ${cookie()}`,
  ]) {
    expect(
      await frames.authorize(request(value), sessionId, 1, "10.0.0.1"),
    ).toBe("unauthorized");
  }
  const missing = request();
  missing.headers.delete("Cookie");
  expect(await frames.authorize(missing, sessionId, 1, undefined)).toBe(
    "unauthorized",
  );
  expect(await frames.authorize(request(), attendeeId, 1, undefined)).toBe(
    "unauthorized",
  );
  revoked = true;
  expect(await frames.authorize(request(), sessionId, 1, undefined)).toBe(
    "unauthorized",
  );
});

it.each(["ended", "expired"])("denies %s sessions", async (state) => {
  status = state;
  const frames = createFrameAccess(env, origin, createIngestAuthority(env));
  expect(await frames.authorize(request(), sessionId, 1, undefined)).toBe(
    "unauthorized",
  );
});

it("fails closed on backend errors", async () => {
  access.requireMembership.mockRejectedValue(new Error("unavailable"));
  expect(
    await createFrameAccess(env, origin, createIngestAuthority(env)).authorize(
      request(),
      sessionId,
      1,
      undefined,
    ),
  ).toBe("unauthorized");
});

it("requires the configured production Origin, including when it is unset", async () => {
  for (const APP_ORIGIN of [origin, undefined]) {
    const settings = { ...env, APP_ORIGIN };
    const frames = createFrameAccess(
      settings,
      origin,
      createIngestAuthority(settings),
    );
    for (const source of [
      "https://evil.example",
      "null",
      "http://localhost",
      "",
    ]) {
      expect(
        await frames.authorize(
          request(cookie(), source),
          sessionId,
          1,
          undefined,
        ),
      ).toBe("unauthorized");
    }
    const missing = request();
    missing.headers.delete("Origin");
    expect(await frames.authorize(missing, sessionId, 1, undefined)).toBe(
      "unauthorized",
    );
    if (!APP_ORIGIN)
      expect(await frames.authorize(request(), sessionId, 1, undefined)).toBe(
        "unauthorized",
      );
  }
});

it("matches caption epochs exactly without advancing them; falls back per session before ingest", async () => {
  const authority = createIngestAuthority(env);
  const frames = createFrameAccess(env, origin, authority);
  expect(await frames.authorize(request(), sessionId, 2, undefined)).toBe(
    "allowed",
  );
  expect(await frames.authorize(request(), sessionId, 1, undefined)).toBe(
    "stale_epoch",
  );
  expect(authority.currentEpoch?.(sessionId)).toBeUndefined();
  expect(authority.checkEpoch(sessionId, 3)).toBe(true);
  for (const epoch of [2, 4])
    expect(await frames.authorize(request(), sessionId, epoch, undefined)).toBe(
      "stale_epoch",
    );
  expect(await frames.authorize(request(), sessionId, 3, undefined)).toBe(
    "allowed",
  );
  expect(authority.currentEpoch?.(sessionId)).toBe(3);
  expect(authority.currentEpoch?.(attendeeId)).toBeUndefined();
});

it("keeps strict development access and never grants a production dev bypass", async () => {
  for (const NODE_ENV of ["development", "production"]) {
    const settings = { NODE_ENV, CAPTIONS_DEV_SESSION: sessionId };
    const frames = createFrameAccess(
      settings,
      origin,
      createIngestAuthority(settings),
    );
    expect(await frames.authorize(request(""), sessionId, 1, "127.0.0.1")).toBe(
      NODE_ENV === "development" ? "allowed" : "unauthorized",
    );
    expect(await frames.authorize(request(""), sessionId, 1, "10.0.0.1")).toBe(
      "unauthorized",
    );
  }
});

it("serves production-mode HTTP with membership, observation conflicts, and a post-storage access recheck", async () => {
  const authority = createIngestAuthority(env);
  authority.checkEpoch(sessionId, 2);
  const sink = new InMemoryObservationSink();
  const put = vi.fn(async () => {});
  const runtime = readRuntimeEnv(env);
  const frames = new FrameTransport(
    runtime.frameEnv,
    "http://localhost",
    () =>
      createFrameUpload({
        access: createFrameAccess(
          runtime.frameEnv,
          "http://localhost",
          authority,
        ),
        store: { put },
        sink,
      }),
    authority,
  );
  const server = createServer((req, res) => {
    if (!frames.handleHttp(req, res, req.socket.remoteAddress))
      res.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const headers = {
    Origin: origin,
    Cookie: cookie(),
    "Content-Type": "image/jpeg",
    "X-Frame-Metadata": JSON.stringify({
      epoch: 2,
      seq: 0,
      captureSampleOffset: 24000,
      width: 1,
      height: 1,
      mimeType: "image/jpeg",
      captureState: "live",
      checksum: createHash("sha256").update(bytes).digest("hex"),
    }),
  };
  const url = `http://127.0.0.1:${address.port}/api/sessions/${sessionId}/frames`;
  try {
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, Origin: "https://evil.example" },
          body: bytes,
        })
      ).status,
    ).toBe(403);
    expect(put).not.toHaveBeenCalled();
    const persist = vi
      .spyOn(sink, "put")
      .mockRejectedValueOnce(new ObservationConflictError());
    const conflict = await fetch(url, { method: "POST", headers, body: bytes });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "sequence_conflict" });
    expect(sink.observations.size).toBe(0);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(
      (await fetch(url, { method: "POST", headers, body: bytes })).status,
    ).toBe(200);
    expect(sink.observations.size).toBe(1);
    sink.observations.clear();
    put.mockImplementation(async () => {
      revoked = true;
    });
    const next = {
      ...headers,
      "X-Frame-Metadata": JSON.stringify({
        ...JSON.parse(headers["X-Frame-Metadata"]),
        seq: 1,
      }),
    };
    expect(
      (await fetch(url, { method: "POST", headers: next, body: bytes })).status,
    ).toBe(503);
    expect(sink.observations.size).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
