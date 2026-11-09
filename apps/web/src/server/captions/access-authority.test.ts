import { once } from "node:events";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { WebSocket } from "ws";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockTranscriptionModelV4 } from "ai/test";
import { encodeAudioFrame } from "@simon-says/contracts/audio-frame";
import { InMemorySegmentSink } from "./segment-sink";
import { AccessError } from "../access/errors";
import { principalCookieName, signPrincipal } from "../access/credentials";
import {
  createIngestAuthority,
  MembershipIngestAuthority,
} from "./access-authority";
import { CaptionTransport } from "./transport";

const access = vi.hoisted(() => ({
  requireMembership: vi.fn(
    async (_options: {
      sessionId: string;
      principalId: string | null;
      role?: string;
    }) => {
      void _options;
      return { session: { status: "setup" } };
    },
  ),
}));
vi.mock("../access/membership", () => access);
const sessionId = "11111111-1111-4111-8111-111111111111";
const hostId = "22222222-2222-4222-8222-222222222222";
const attendeeId = "33333333-3333-4333-8333-333333333333";
const secret = "synthetic-test-session-secret-32-characters";
let revoked = false;
let status = "setup";
function cookie(id: string) {
  return `${principalCookieName}=${encodeURIComponent(signPrincipal({ principalId: id, secret }))}`;
}
function request(value?: string) {
  const req = new IncomingMessage(new Socket());
  if (value !== undefined) req.headers.cookie = value;
  return req;
}
beforeEach(() => {
  revoked = false;
  status = "setup";
  vi.stubEnv("SESSION_SECRET", secret);
  access.requireMembership.mockReset();
  access.requireMembership.mockImplementation(
    async ({ sessionId: id, principalId, role }) => {
      if (
        revoked ||
        status === "expired" ||
        id !== sessionId ||
        ![hostId, attendeeId].includes(principalId ?? "") ||
        (role === "host" && principalId !== hostId)
      ) {
        throw new AccessError(404, "not_found");
      }
      return { session: { status } };
    },
  );
});
afterEach(() => vi.unstubAllEnvs());

it("uses Track 3's signed principal verifier and host role, without trusting other credentials", async () => {
  const authority = new MembershipIngestAuthority();
  expect(
    await authority.authorizeHost(sessionId, request(cookie(hostId))),
  ).toBe(true);
  expect(access.requireMembership).toHaveBeenLastCalledWith({
    sessionId,
    principalId: hostId,
    role: "host",
  });
  expect(
    await authority.authorizeHost(sessionId, request(cookie(attendeeId))),
  ).toBe(false);
  expect(
    await authority.authorizeMember(sessionId, request(cookie(attendeeId))),
  ).toBe(true);
  expect(access.requireMembership).toHaveBeenLastCalledWith({
    sessionId,
    principalId: attendeeId,
  });
  for (const value of [
    undefined,
    cookie(hostId) + "tampered",
    `${principalCookieName}=%ZZ`,
    `${cookie(hostId)}; ${cookie(attendeeId)}`,
  ]) {
    expect(await authority.authorizeMember(sessionId, request(value))).toBe(
      false,
    );
  }
  revoked = true;
  expect(
    await authority.authorizeHost(sessionId, request(cookie(hostId))),
  ).toBe(false);
  expect(
    await authority.authorizeMember(sessionId, request(cookie(attendeeId))),
  ).toBe(false);
});

it("selects database auth ahead of the dev flag and never enables the production bypass", async () => {
  for (const nodeEnv of ["production", "development"]) {
    const authority = createIngestAuthority({
      DATABASE_URL: "configured",
      NODE_ENV: nodeEnv,
      CAPTIONS_DEV_SESSION: sessionId,
    });
    expect(authority).toBeInstanceOf(MembershipIngestAuthority);
    expect(await authority.authorizeHost(sessionId, request())).toBe(false);
  }
  expect(
    await createIngestAuthority({
      NODE_ENV: "production",
      CAPTIONS_DEV_SESSION: sessionId,
    }).authorizeHost(sessionId, request()),
  ).toBe(false);
  expect(
    await createIngestAuthority({
      NODE_ENV: "development",
      CAPTIONS_DEV_SESSION: sessionId,
    }).authorizeHost(sessionId, request()),
  ).toBe(true);
  expect(
    await createIngestAuthority({ NODE_ENV: "development" }).authorizeHost(
      sessionId,
      request(),
    ),
  ).toBe(false);
});

it("fences epochs independently for UUID sessions", () => {
  const authority = new MembershipIngestAuthority();
  expect(authority.checkEpoch(sessionId, 2)).toBe(true);
  expect(authority.checkEpoch(sessionId, 1)).toBe(false);
  expect(authority.checkEpoch(attendeeId, 1)).toBe(true);
});

async function socketServer(
  options: Partial<ConstructorParameters<typeof CaptionTransport>[0]> = {},
) {
  const transport = new CaptionTransport({
    authority: new MembershipIngestAuthority(),
    membershipRecheckMs: 25,
    ...options,
  });
  const server = createServer(async (req, res) => {
    if (!(await transport.handleHttp(req, res))) res.writeHead(404).end();
  });
  server.on("upgrade", async (req, socket, head) => {
    if (!(await transport.handleUpgrade(req, socket, head))) socket.destroy();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing_address");
  const base = `http://127.0.0.1:${address.port}/api/sessions/${sessionId}`;
  return {
    base,
    close: async () => {
      await transport.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

it("denies ingest to attendees/nonmembers with unauthorized and hides SSE existence with 404", async () => {
  const server = await socketServer();
  try {
    for (const value of [cookie(attendeeId), ""]) {
      const ws = new WebSocket(
        server.base.replace("http:", "ws:") + "/ingest",
        { headers: { Cookie: value } },
      );
      const message = once(ws, "message");
      const closed = once(ws, "close");
      expect(JSON.parse((await message)[0].toString())).toEqual({
        type: "rejected",
        reason: "unauthorized",
        retryable: false,
      });
      expect((await closed)[0]).toBe(1008);
    }
    expect((await fetch(server.base + "/events")).status).toBe(404);
    revoked = true;
    expect(
      (
        await fetch(server.base + "/events", {
          headers: { Cookie: cookie(attendeeId) },
        })
      ).status,
    ).toBe(404);
  } finally {
    await server.close();
  }
});

it("admits a UUID host and member, then closes both real connections when membership is revoked", async () => {
  const server = await socketServer();
  let ws: WebSocket | undefined;
  try {
    const response = await fetch(server.base + "/events", {
      headers: { Cookie: cookie(attendeeId) },
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      sessionId,
    );
    ws = new WebSocket(server.base.replace("http:", "ws:") + "/ingest", {
      headers: { Cookie: cookie(hostId) },
    });
    await once(ws, "open");
    const ready = once(ws, "message");
    ws.send(
      JSON.stringify({
        type: "hello",
        epoch: 1,
        lastSentSeq: -1,
        sampleRate: 24000,
      }),
    );
    expect(JSON.parse((await ready)[0].toString())).toMatchObject({
      type: "ready",
      epoch: 1,
    });
    const rejected = once(ws, "message");
    const closed = once(ws, "close");
    // A destroyed SSE may surface EOF or a network error; either must end delivery.
    const ended = (async () => {
      try {
        while (!(await reader.read()).done) {
          /* Drain pre-revocation frames. */
        }
      } catch {
        /* Revocation destroys the stream, discarding queued private data. */
      }
    })();
    revoked = true;
    expect(JSON.parse((await rejected)[0].toString())).toEqual({
      type: "rejected",
      reason: "unauthorized",
      retryable: false,
    });
    expect((await closed)[0]).toBe(1008);
    await ended;
    expect(
      (
        await fetch(server.base + "/events", {
          headers: { Cookie: cookie(attendeeId) },
        })
      ).status,
    ).toBe(404);
  } finally {
    ws?.terminate();
    await server.close();
  }
});

it("fails closed on backend errors for admission and periodic checks", async () => {
  const server = await socketServer();
  try {
    const response = await fetch(server.base + "/events", {
      headers: { Cookie: cookie(attendeeId) },
    });
    const reader = response.body!.getReader();
    await reader.read();
    access.requireMembership.mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(reader.read()).rejects.toThrow();
    expect(
      (
        await fetch(server.base + "/events", {
          headers: { Cookie: cookie(attendeeId) },
        })
      ).status,
    ).toBe(404);
  } finally {
    await server.close();
  }
});

it("bounds stalled access checks instead of accepting or hanging an admission", async () => {
  vi.useFakeTimers();
  access.requireMembership.mockReturnValue(new Promise(() => {}));
  const transport = new CaptionTransport({
    authority: new MembershipIngestAuthority(),
  });
  try {
    const req = request(cookie(hostId));
    req.url = `/api/sessions/${sessionId}/events`;
    req.method = "GET";
    const res = new ServerResponse(req);
    const admission = transport.handleHttp(req, res);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await admission).toBe(true);
    expect(res.statusCode).toBe(404);
    expect(res.writableEnded).toBe(true);
  } finally {
    await transport.close();
    vi.useRealTimers();
  }
});

it.each(["setup", "live", "degraded"])(
  "allows host ingest in %s",
  async (state) => {
    status = state;
    expect(
      await new MembershipIngestAuthority().authorizeHost(
        sessionId,
        request(cookie(hostId)),
      ),
    ).toBe(true);
  },
);

it.each(["ended", "expired", "revoked"])(
  "rejects initial ingest for %s sessions",
  async (state) => {
    status = state === "revoked" ? "live" : state;
    revoked = state === "revoked";
    const server = await socketServer();
    try {
      const ws = new WebSocket(
        server.base.replace("http:", "ws:") + "/ingest",
        { headers: { Cookie: cookie(hostId) } },
      );
      const message = once(ws, "message");
      const closed = once(ws, "close");
      expect(JSON.parse((await message)[0].toString())).toEqual({
        type: "rejected",
        reason: state === "ended" ? "session_ended" : "unauthorized",
        retryable: false,
      });
      expect((await closed)[0]).toBe(1008);
      if (state !== "ended") {
        expect(
          (
            await fetch(server.base + "/events", {
              headers: { Cookie: cookie(attendeeId) },
            })
          ).status,
        ).toBe(404);
      }
    } finally {
      await server.close();
    }
  },
);

it("keeps ended-session member SSE access through periodic checks", async () => {
  status = "ended";
  const server = await socketServer();
  const controller = new AbortController();
  try {
    const response = await fetch(server.base + "/events", {
      headers: { Cookie: cookie(attendeeId) },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      sessionId,
    );
    await vi.waitFor(() =>
      expect(
        access.requireMembership.mock.calls.filter(
          ([options]) => options.role === undefined,
        ).length,
      ).toBeGreaterThanOrEqual(3),
    );
    let ended = false;
    const reading = (async () => {
      try {
        while (!(await reader.read()).done) {
          /* Drain queued snapshot frames. */
        }
      } catch {
        /* Aborting the test request also ends the reader. */
      }
      ended = true;
    })();
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(ended).toBe(false);
    controller.abort();
    await reading;
  } finally {
    controller.abort();
    await server.close();
  }
});

it.each(["ended", "expired"])(
  "closes open ingest when the session becomes %s",
  async (state) => {
    let committed = false;
    let receivedSamples = 0;
    const sink = new InMemorySegmentSink();
    const model = new MockTranscriptionModelV4({
      doStream: async ({ audio }) => ({
        stream: new ReadableStream({
          async start(controller) {
            const reader = audio.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (typeof value === "string")
                throw new Error("unexpected_base64");
              receivedSamples += value.byteLength / 2;
            }
            committed = true;
            controller.enqueue({
              type: "transcript-final",
              text: "Tail caption.",
            });
            controller.enqueue({
              type: "finish",
              text: "Tail caption.",
              segments: [],
            });
            controller.close();
          },
        }),
      }),
    });
    const server = await socketServer({
      model: {
        specificationVersion: "v4",
        provider: model.provider,
        modelId: model.modelId,
        doGenerate: model.doGenerate,
        doStream: model.doStream!,
      },
      sink,
      reconnectGraceMs: 60000,
    });
    let ws: WebSocket | undefined;
    try {
      ws = new WebSocket(server.base.replace("http:", "ws:") + "/ingest", {
        headers: { Cookie: cookie(hostId) },
      });
      await once(ws, "open");
      const ready = once(ws, "message");
      ws.send(
        JSON.stringify({
          type: "hello",
          epoch: 1,
          lastSentSeq: -1,
          sampleRate: 24000,
        }),
      );
      expect(JSON.parse((await ready)[0].toString()).type).toBe("ready");
      ws.send(
        encodeAudioFrame({
          epoch: 1,
          seq: 0,
          sampleOffset: 0,
          samples: new Int16Array(2400).fill(1000),
        }),
      );
      await vi.waitFor(() => expect(receivedSamples).toBe(2400));
      expect(committed).toBe(false);
      const rejected = once(ws, "message");
      const closed = once(ws, "close");
      status = state;
      expect(JSON.parse((await rejected)[0].toString())).toEqual({
        type: "rejected",
        reason: state === "ended" ? "session_ended" : "unauthorized",
        retryable: false,
      });
      expect((await closed)[0]).toBe(1008);
      if (state === "ended") {
        // The 60-second reconnect grace must not delay a normal stop's tail commit.
        await vi.waitFor(() => expect(committed).toBe(true));
        await vi.waitFor(() =>
          expect([...sink.segments.values()]).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                text: "Tail caption.",
                startMs: 0,
                endMs: 100,
              }),
            ]),
          ),
        );
      }
    } finally {
      ws?.terminate();
      await server.close();
    }
  },
);
