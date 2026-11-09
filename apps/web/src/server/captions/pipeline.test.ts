import { createServer, IncomingMessage } from "node:http";
import { once } from "node:events";
import { Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { MockTranscriptionModelV4 } from "ai/test";
import { WebSocket } from "ws";
import {
  encodeAudioFrame,
  type AudioFrame,
} from "@simon-says/contracts/audio-frame";
import {
  captionEventSchema,
  type CaptionEvent,
} from "@simon-says/contracts/caption";
import { serverIngestMessageSchema } from "@simon-says/contracts/ingest";
import { CaptionAssembler, type WindowResult } from "./assembler";
import { EventHub } from "./event-hub";
import { RingBuffer } from "./ring-buffer";
import { InMemorySegmentSink, type SegmentSink } from "./segment-sink";
import { WindowManager } from "./window-manager";
import { CaptionTransport } from "./transport";
import { DevIngestAuthority } from "./ingest-authority";
import { readRuntimeEnv } from "../../../server/env";

type Call = { chunks: number[]; committed: boolean; openedAt: number };
function fakeModel(
  options: {
    fail?: number;
    failAfterFirstRead?: boolean;
    finalDelay?: (call: number) => number;
  } = {},
) {
  const calls: Call[] = [];
  const model = new MockTranscriptionModelV4({
    doStream: async ({
      audio,
      abortSignal,
      inputAudioFormat,
      providerOptions,
    }) => {
      expect(inputAudioFormat).toEqual({ type: "audio/pcm", rate: 24000 });
      expect(providerOptions).toEqual({
        openai: { language: "en", streaming: { delay: "low" } },
      });
      const index = calls.length;
      const call: Call = {
        chunks: [],
        committed: false,
        openedAt: performance.now(),
      };
      calls.push(call);
      return {
        stream: new ReadableStream({
          async start(controller) {
            const reader = audio.getReader();
            const abort = () => {
              void reader.cancel().catch(() => {});
            };
            abortSignal?.addEventListener("abort", abort, { once: true });
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (typeof value === "string")
                  throw new Error("unexpected_base64");
                const view = new DataView(
                  value.buffer,
                  value.byteOffset,
                  value.byteLength,
                );
                for (let offset = 0; offset < value.byteLength; offset += 2)
                  call.chunks.push(view.getInt16(offset, true));
                if (index === 0 && options.failAfterFirstRead)
                  throw new Error("scripted_midstream_failure");
                controller.enqueue({
                  type: "transcript-delta",
                  delta: "Hello. ",
                });
              }
              if (abortSignal?.aborted) {
                controller.close();
                return;
              }
              call.committed = true;
              if (index < (options.fail ?? 0))
                throw new Error("private provider error must never escape");
              const delay = options.finalDelay?.(index) ?? 0;
              if (delay)
                await new Promise((resolve) => setTimeout(resolve, delay));
              controller.enqueue({
                type: "transcript-final",
                text: "Hello world. Another sentence.",
              });
              controller.enqueue({
                type: "finish",
                text: "Hello world. Another sentence.",
                segments: [],
              });
              controller.close();
            } catch (error) {
              controller.error(error);
            } finally {
              abortSignal?.removeEventListener("abort", abort);
              reader.releaseLock();
            }
          },
        }),
      };
    },
  });
  return {
    model: {
      specificationVersion: "v4" as const,
      provider: model.provider,
      modelId: model.modelId,
      doGenerate: model.doGenerate,
      doStream: model.doStream!,
    },
    calls,
  };
}
const planner = {
  sampleRate: 24000,
  minWindowMs: 200,
  pauseMs: 20,
  shortPauseAfterMs: 250,
  shortPauseMs: 20,
  maxWindowMs: 300,
  hardGraceMs: 20,
  prewarmLeadMs: 100,
};
function frame(seq: number, value = 0): AudioFrame {
  return {
    epoch: 1,
    seq,
    sampleOffset: seq * 2400,
    samples: new Int16Array(2400).fill(value),
  };
}
function pipeline(
  fake = fakeModel(),
  sink: SegmentSink = new InMemorySegmentSink(),
) {
  const hub = new EventHub("dev");
  const events: CaptionEvent[] = [];
  hub.subscribe((event) => events.push(event));
  const assembler = new CaptionAssembler(hub, sink, 1);
  const manager = new WindowManager({
    model: fake.model,
    assembler,
    hub,
    epoch: 1,
    planner,
  });
  return { ...fake, hub, events, assembler, manager };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function result(index: number): WindowResult {
  return {
    index,
    windowId: `1-${index}`,
    range: { startMs: index * 200, endMs: (index + 1) * 200 },
    text: "Hello.",
    deltas: [],
    lagMs: 800,
  };
}

describe("offline live captions", () => {
  it("rotates at an exact cut, preopens the successor, commits on close, and preserves all samples", async () => {
    const p = pipeline();
    p.manager.push(frame(0, 1));
    await tick();
    expect(p.calls).toHaveLength(2);
    expect(p.calls[0]!.committed).toBe(false);
    expect(p.calls[1]!.chunks).toEqual([]);
    p.manager.push(frame(1, 2));
    await tick();
    expect(p.calls[0]!.committed).toBe(true);
    p.manager.push(frame(2, 3));
    await tick();
    await p.manager.finish();
    const received = p.calls
      .filter((call) => call.committed)
      .flatMap((call) => call.chunks);
    expect(received).toEqual([
      ...frame(0, 1).samples,
      ...frame(1, 2).samples,
      ...frame(2, 3).samples,
    ]);
    for (const event of p.events)
      expect(captionEventSchema.safeParse(event).success).toBe(true);
  });

  it("records short-pause rotation and keeps finals scoped to compliant window IDs", async () => {
    const fake = fakeModel();
    const hub = new EventHub("dev.session_1-test");
    const events: CaptionEvent[] = [];
    hub.subscribe((event) => events.push(event));
    const telemetry = vi.fn();
    const manager = new WindowManager({
      model: fake.model,
      hub,
      assembler: new CaptionAssembler(hub, new InMemorySegmentSink(), 1),
      epoch: 1,
      telemetry,
      planner: {
        ...planner,
        minWindowMs: 400,
        pauseMs: 300,
        shortPauseAfterMs: 600,
        shortPauseMs: 150,
        maxWindowMs: 1000,
      },
    });
    for (let seq = 0; seq < 8; seq++) {
      expect(manager.push(frame(seq, seq < 6 ? 10000 : 0))).toBe("accepted");
      await tick();
    }
    await manager.finish();
    expect(telemetry).toHaveBeenCalledWith("window_cut_short_pause", 1);
    const finals = events.filter((event) => event.kind === "caption.final");
    expect(finals).toHaveLength(2);
    for (const event of events)
      expect(captionEventSchema.parse(event)).toEqual(event);
    for (const event of finals) {
      expect(event.segments.length).toBeGreaterThan(0);
      for (const segment of event.segments) {
        expect(segment).toMatchObject({
          sessionId: event.sessionId,
          epoch: event.epoch,
          windowId: event.windowId,
        });
        expect(segment.segmentId).toMatch(/^[A-Za-z0-9._-]+$/);
        expect(segment.windowId).toMatch(/^[A-Za-z0-9._-]+$/);
      }
    }
    expect(fake.calls.filter((call) => call.committed)[0]?.chunks).toHaveLength(
      18240,
    );
  });

  it("cuts inside a wire frame without losing or duplicating its samples", async () => {
    const fake = fakeModel();
    const hub = new EventHub("dev");
    const manager = new WindowManager({
      model: fake.model,
      hub,
      assembler: new CaptionAssembler(hub, new InMemorySegmentSink(), 1),
      epoch: 1,
      planner: { ...planner, minWindowMs: 220 },
    });
    const expected = Array.from({ length: 7200 }, (_, i) => (i % 3) + 1);
    for (let seq = 0; seq < 3; seq++) {
      manager.push({
        ...frame(seq),
        samples: Int16Array.from(expected.slice(seq * 2400, (seq + 1) * 2400)),
      });
      await tick();
    }
    await manager.finish();
    expect(fake.calls.filter((call) => call.committed)[0]?.chunks).toHaveLength(
      5280,
    );
    expect(
      fake.calls
        .filter((call) => call.committed)
        .flatMap((call) => call.chunks),
    ).toEqual(expected);
  });

  it("fences a final that was waiting on persistence when its epoch is cancelled", async () => {
    let release!: () => void;
    const p = pipeline(fakeModel(), {
      writeSegments: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    const pending = p.assembler.complete(result(0));
    await tick();
    p.manager.cancel();
    release();
    await pending;
    expect(p.events.some((event) => event.kind === "caption.final")).toBe(
      false,
    );
  });

  it("publishes out-of-order finals in window order with monotonic cursors", async () => {
    const p = pipeline(
      fakeModel({ finalDelay: (index) => (index === 0 ? 30 : 0) }),
    );
    for (let i = 0; i < 4; i++) {
      p.manager.push(frame(i));
      await tick();
    }
    await p.manager.finish();
    expect(
      p.events
        .filter((event) => event.kind === "caption.final")
        .map((event) => event.windowId),
    ).toEqual(["1-0", "1-1"]);
    expect(p.events.map((event) => event.cursor)).toEqual(
      p.events.map((event) => event.cursor).sort(),
    );
  });

  it("replays byte-identical audio on the second attempt", async () => {
    const p = pipeline(fakeModel({ fail: 1 }));
    p.manager.push(frame(0, 123));
    await tick();
    await p.manager.finish();
    expect(p.calls).toHaveLength(3); // includes the unused prewarm
    const attempts = p.calls.filter((call) => call.committed);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]!.chunks).toEqual(attempts[0]!.chunks);
    expect(p.events.some((event) => event.kind === "caption.final")).toBe(true);
  });

  it("replays a midstream failure and continues to consume newly arriving audio", async () => {
    const p = pipeline(fakeModel({ failAfterFirstRead: true }));
    p.manager.push(frame(0, 1));
    await tick();
    p.manager.push(frame(1, 2));
    await tick();
    await p.manager.finish();
    const finalCalls = p.calls.filter((call) => call.committed);
    expect(finalCalls.flatMap((call) => call.chunks)).toEqual([
      ...frame(0, 1).samples,
      ...frame(1, 2).samples,
    ]);
    expect(p.calls[0]?.committed).toBe(false);
    expect(p.events.some((event) => event.kind === "caption.final")).toBe(true);
  });

  it("after two retries exposes precisely the failed source range", async () => {
    const p = pipeline(fakeModel({ fail: 100 }));
    p.manager.push(frame(0));
    await tick();
    await p.manager.finish();
    expect(p.calls.filter((call) => call.committed)).toHaveLength(3);
    expect(
      p.events.filter((event) => event.kind === "caption.gap"),
    ).toMatchObject([
      { startMs: 0, endMs: 100, reason: "transcription_failed" },
    ]);
    expect(p.events.some((event) => event.kind === "caption.final")).toBe(
      false,
    );
  });

  it("deduplicates frames, rejects changed bytes, and replays slices", () => {
    const ring = new RingBuffer(4800);
    expect(ring.add(frame(0, 1))).toBe("added");
    expect(ring.add(frame(0, 1))).toBe("duplicate");
    expect(ring.add(frame(0, 2))).toBe("sequence_conflict");
    ring.add(frame(1, 2));
    expect(ring.replay(2300, 2500)?.map((samples) => samples.length)).toEqual([
      100, 100,
    ]);
    ring.add(frame(2, 3));
    expect(ring.replay(0, 10)).toBeNull();
  });

  it("waits for the sink before publishing a final", async () => {
    let release!: () => void;
    const write = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const p = pipeline(fakeModel(), { writeSegments: write });
    const pending = p.assembler.complete(result(0));
    await tick();
    expect(write).toHaveBeenCalledOnce();
    expect(p.events.some((event) => event.kind === "caption.final")).toBe(
      false,
    );
    release();
    await pending;
    expect(p.events.at(-1)?.kind).toBe("caption.final");
  });

  it("surfaces sink failure without a final, then permits later windows", async () => {
    const p = pipeline(fakeModel(), {
      writeSegments: vi
        .fn()
        .mockRejectedValueOnce(new Error("private text"))
        .mockResolvedValue(undefined),
    });
    await p.assembler.complete(result(0));
    expect(p.events.some((event) => event.kind === "caption.final")).toBe(
      false,
    );
    expect(p.events).toContainEqual(
      expect.objectContaining({
        kind: "capture.state",
        reason: "segment_sink_failed",
      }),
    );
    await p.assembler.complete(result(1));
    expect(p.events.at(-1)).toMatchObject({
      kind: "caption.final",
      windowId: "1-1",
    });
  });

  it("replays retained cursors and snapshots old cursors with valid increasing IDs", () => {
    const hub = new EventHub("dev", 2);
    hub.publish({
      kind: "caption.final",
      epoch: 1,
      windowId: "1-0",
      segments: [],
    });
    const event = hub.publish({ kind: "clock.heartbeat", sourceMs: 1 });
    hub.publish({ kind: "clock.heartbeat", sourceMs: 2 });
    const replay: CaptionEvent[] = [];
    hub.subscribe((e) => replay.push(e), event.cursor)();
    expect(replay).toHaveLength(1);
    const snapshot: CaptionEvent[] = [];
    hub.subscribe((e) => snapshot.push(e), "0")();
    expect(snapshot.map((e) => e.kind)).toEqual([
      "capture.state",
      "caption.final",
    ]);
    expect(snapshot[1]!.cursor > snapshot[0]!.cursor).toBe(true);
  });

  it("keeps missing provider configuration optional and production authority closed", () => {
    expect(readRuntimeEnv({ NODE_ENV: "test" }).openaiApiKey).toBeUndefined();
    expect(readRuntimeEnv({ NODE_ENV: "test" }).captionModel).toBe(
      "gpt-realtime-whisper",
    );
    expect(() =>
      readRuntimeEnv({ NODE_ENV: "test", CAPTION_DELAY: "invalid" }),
    ).toThrow("CAPTION_DELAY");
    expect(
      new DevIngestAuthority(undefined).authorizeHost(
        "dev",
        new IncomingMessage(new Socket()),
      ),
    ).toBe(false);
    expect(
      new DevIngestAuthority("dev", true).authorizeHost(
        "dev",
        new IncomingMessage(new Socket()),
      ),
    ).toBe(false);
  });
});

// Synthetic PCM WAV fixture: parse its data section before producing wire frames.
function syntheticWavFrames(count: number) {
  const wav = Buffer.alloc(44 + count * 4800);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  const samples = new Int16Array(
    wav.buffer,
    wav.byteOffset + 44,
    (wav.length - 44) / 2,
  );
  return Array.from({ length: count }, (_, seq) =>
    encodeAudioFrame({
      epoch: 1,
      seq,
      sampleOffset: seq * 2400,
      samples: samples.slice(seq * 2400, (seq + 1) * 2400),
    }),
  );
}

async function socketServer(model = true) {
  const fake = fakeModel();
  const transport = new CaptionTransport({
    authority: new DevIngestAuthority("dev.session_1-test"),
    ...(model ? { model: fake.model } : {}),
    managerConfig: { planner },
  });
  const server = createServer((req, res) => {
    if (!transport.handleHttp(req, res)) res.writeHead(404).end();
  });
  server.on("upgrade", (req, socket, head) => {
    if (!transport.handleUpgrade(req, socket, head)) socket.destroy();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing_address");
  const base = `http://127.0.0.1:${address.port}`;
  const close = async () => {
    transport.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  return { base, close };
}

it("real WebSocket hello, WAV frames, batched ack, ordered SSE finals and epoch fencing", async () => {
  const server = await socketServer();
  const abort = new AbortController();
  const sockets: WebSocket[] = [];
  try {
    const response = await fetch(
      `${server.base}/api/sessions/dev.session_1-test/events`,
      {
        signal: abort.signal,
      },
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const events: CaptionEvent[] = [];
    const reader = response.body!.getReader();
    const reading = (async () => {
      let pending = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += new TextDecoder().decode(value);
          let boundary: number;
          while ((boundary = pending.indexOf("\n\n")) >= 0) {
            const message = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            const data = message
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (data) {
              const event = captionEventSchema.parse(JSON.parse(data.slice(6)));
              expect(message).toContain(`id: ${event.cursor}`);
              events.push(event);
            }
          }
        }
      } catch {
        if (!abort.signal.aborted) throw new Error("sse_read_failed");
      }
    })();
    const ws = new WebSocket(
      server.base.replace("http:", "ws:") +
        "/api/sessions/dev.session_1-test/ingest",
    );
    sockets.push(ws);
    const messages: unknown[] = [];
    ws.on("message", (data) =>
      messages.push(
        serverIngestMessageSchema.parse(JSON.parse(data.toString())),
      ),
    );
    await once(ws, "open");
    ws.send(
      JSON.stringify({
        type: "hello",
        epoch: 1,
        lastSentSeq: -1,
        sampleRate: 24000,
      }),
    );
    await vi.waitFor(() =>
      expect(messages).toContainEqual({
        type: "ready",
        epoch: 1,
        ackedThroughSeq: -1,
      }),
    );
    for (const bytes of syntheticWavFrames(5)) {
      ws.send(bytes);
      await tick();
    }
    await vi.waitFor(() =>
      expect(messages).toContainEqual({ type: "ack", epoch: 1, throughSeq: 4 }),
    );
    await vi.waitFor(() =>
      expect(
        events.filter((event) => event.kind === "caption.final").length,
      ).toBeGreaterThanOrEqual(2),
    );
    const replacement = new WebSocket(
      server.base.replace("http:", "ws:") +
        "/api/sessions/dev.session_1-test/ingest",
    );
    sockets.push(replacement);
    await once(replacement, "open");
    replacement.send(
      JSON.stringify({
        type: "hello",
        epoch: 2,
        lastSentSeq: -1,
        sampleRate: 24000,
      }),
    );
    await vi.waitFor(() =>
      expect(messages).toContainEqual({
        type: "rejected",
        reason: "stale_epoch",
        retryable: false,
      }),
    );
    abort.abort();
    await reading;
  } finally {
    abort.abort();
    for (const ws of sockets) ws.terminate();
    await server.close();
  }
});

it("missing key exposes a clear degraded SSE state without crashing the server", async () => {
  const server = await socketServer(false);
  const abort = new AbortController();
  try {
    const response = await fetch(
      `${server.base}/api/sessions/dev.session_1-test/events`,
      {
        signal: abort.signal,
      },
    );
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain(
      '"reason":"missing_provider_key"',
    );
    await reader.cancel();
    expect(
      (await fetch(`${server.base}/api/sessions/other/events`)).status,
    ).toBe(403);
  } finally {
    abort.abort();
    await server.close();
  }
});
