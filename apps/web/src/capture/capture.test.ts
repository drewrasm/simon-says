import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FRAME_SAMPLES,
  decodeAudioFrame,
} from "@simon-says/contracts/audio-frame";
import { floatToPcm16, PcmFramer } from "../../public/capture/pcm.js";
import { FrameSequencer, ResendBuffer, reconnectDelay } from "./frames";
import { IngestClient, type IngestSocket } from "./ingest-client";
import { microphoneConstraints, HostCapture } from "./host-capture";

const samples = () => new Int16Array(FRAME_SAMPLES);
class FakeSocket implements IngestSocket {
  onopen: IngestSocket["onopen"] = null;
  onmessage: IngestSocket["onmessage"] = null;
  onclose: IngestSocket["onclose"] = null;
  onerror: IngestSocket["onerror"] = null;
  readyState = 1;
  bufferedAmount = 0;
  sent: (string | ArrayBuffer)[] = [];
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (typeof data !== "string" && !(data instanceof ArrayBuffer))
      throw new Error("Unexpected payload");
    this.sent.push(data);
  }
  close = vi.fn();
  open() {
    this.onopen?.(new Event("open"));
  }
  message(data: unknown) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: typeof data === "string" ? data : JSON.stringify(data),
      }),
    );
  }
  disconnect() {
    this.onerror?.(new Event("error"));
  }
  frames() {
    return this.sent
      .filter((data) => data instanceof ArrayBuffer)
      .map((data) => decodeAudioFrame(new Uint8Array(data)));
  }
}
// Fake event callbacks do not depend on the native WebSocket receiver.
function setup() {
  const sockets: FakeSocket[] = [];
  const states: string[] = [];
  const client = new IngestClient(
    "ws://localhost/ingest",
    7,
    (state) => states.push(state),
    () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  );
  client.start();
  return { client, sockets, states, sequence: new FrameSequencer(7) };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PCM worklet DSP", () => {
  it("clamps signed extremes and handles nonfinite values", () => {
    expect(
      [-2, -1, -0.5, 0, 0.5, 1, 2, NaN, Infinity].map(floatToPcm16),
    ).toEqual([-32768, -32768, -16384, 0, 16384, 32767, 32767, 0, 0]);
  });
  it.each([24000, 44100, 48000, 16000])(
    "frames/resamples %i Hz across arbitrary block boundaries",
    (rate) => {
      const frames: Int16Array[] = [];
      const levels: number[] = [];
      const framer = new PcmFramer(rate, 24000, FRAME_SAMPLES, (pcm, level) => {
        frames.push(pcm);
        levels.push(level);
      });
      const input = new Float32Array(rate).fill(0.5);
      for (let offset = 0; offset < input.length; offset += 128)
        framer.push(input.subarray(offset, offset + 128));
      // Upsampling needs the next input sample to interpolate the final fraction.
      framer.push(new Float32Array([0.5]));
      expect(frames).toHaveLength(10);
      expect(
        frames.every(
          (frame) =>
            frame.length === FRAME_SAMPLES &&
            frame.every((value) => value === 16384),
        ),
      ).toBe(true);
      expect(levels.every((level) => level === 0.5)).toBe(true);
    },
  );
  it("interpolates ramps and preserves phase across chunks", () => {
    const result: Int16Array[] = [];
    const framer = new PcmFramer(4, 8, 4, (frame) => result.push(frame));
    framer.push(new Float32Array([0, 0.25]));
    framer.push(new Float32Array([0.5]));
    expect([...result[0]!]).toEqual([0, 4096, 8192, 12288]);
  });
});

it("uses samples as the only clock and rejects incomplete frames", () => {
  const sequence = new FrameSequencer(7);
  expect(sequence.next(samples())).toMatchObject({
    epoch: 7,
    seq: 0,
    sampleOffset: 0,
  });
  expect(sequence.next(samples())).toMatchObject({
    seq: 1,
    sampleOffset: 2400,
  });
  expect(() => sequence.next(new Int16Array(4))).toThrow();
  expect(() => new FrameSequencer(0)).toThrow();
});
it("trims acks, merges consecutive overflow gaps, and retains gaps after ack", () => {
  const buffer = new ResendBuffer(200);
  const sequence = new FrameSequencer(7);
  for (let i = 0; i < 4; i++) buffer.add(sequence.next(samples()));
  expect(buffer.localGaps).toEqual([
    { startSampleOffset: 0, endSampleOffset: 4800 },
  ]);
  expect(buffer.unackedMs).toBe(200);
  expect(buffer.after(2).map((frame) => frame.seq)).toEqual([3]);
  buffer.acknowledge(2);
  expect(buffer.unackedMs).toBe(100);
  buffer.acknowledge(3);
  expect(buffer.lastSentSeq).toBe(-1);
  expect(buffer.localGaps).toHaveLength(1);
});
it("caps exponential backoff with equal jitter", () => {
  expect(reconnectDelay(0, () => 0)).toBe(250);
  expect(reconnectDelay(1, () => 1)).toBe(1000);
  expect(reconnectDelay(1000, () => 1)).toBe(15000);
  expect(reconnectDelay(1000, () => 0)).toBe(7500);
});

describe("ingest protocol", () => {
  it("waits for ready, streams once, trims ack and replays only retained frames", () => {
    vi.useFakeTimers();
    const { client, sockets, sequence } = setup();
    const first = sockets[0]!;
    client.push(sequence.next(samples()));
    first.open();
    expect(JSON.parse(String(first.sent[0]))).toEqual({
      type: "hello",
      epoch: 7,
      lastSentSeq: 0,
      sampleRate: 24000,
    });
    expect(first.frames()).toHaveLength(0);
    first.message({ type: "ready", epoch: 7, ackedThroughSeq: -1 });
    client.push(sequence.next(samples()));
    expect(first.frames()).toHaveLength(2);
    first.message({ type: "ack", epoch: 7, throughSeq: 0 });
    expect(client.buffer.unackedMs).toBe(100);
    first.disconnect();
    client.push(sequence.next(samples()));
    vi.advanceTimersByTime(500);
    const second = sockets[1]!;
    second.open();
    second.message({ type: "ready", epoch: 7, ackedThroughSeq: 1 });
    expect(second.frames()).toEqual([
      {
        ok: true,
        frame: { epoch: 7, seq: 2, sampleOffset: 4800, samples: samples() },
      },
    ]);
    client.stop();
  });
  it.each([
    "bad json",
    { type: "ack", epoch: 8, throughSeq: 0 },
    { type: "ready", epoch: 7, ackedThroughSeq: 100 },
  ])("reconnects for malformed or unsafe cursors: %j", (message) => {
    vi.useFakeTimers();
    const { client, sockets, states } = setup();
    sockets[0]!.message(message);
    expect(states.at(-1)).toBe("reconnecting");
    client.stop();
  });
  it("retries overload but permanently stops for nonretryable rejection", () => {
    vi.useFakeTimers();
    const { client, sockets, states, sequence } = setup();
    sockets[0]!.message({
      type: "rejected",
      reason: "overloaded",
      retryable: true,
    });
    vi.advanceTimersByTime(500);
    sockets[1]!.message({
      type: "rejected",
      reason: "stale_epoch",
      retryable: false,
    });
    client.push(sequence.next(samples()));
    expect(states.at(-1)).toBe("rejected");
    expect(client.buffer.unackedMs).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(sockets).toHaveLength(2);
  });
  it("times out handshakes, bounds socket backpressure and cancels retries on stop", () => {
    vi.useFakeTimers();
    const { client, sockets, states, sequence } = setup();
    vi.advanceTimersByTime(10500);
    expect(sockets).toHaveLength(2);
    sockets[1]!.message({ type: "ready", epoch: 7, ackedThroughSeq: -1 });
    sockets[1]!.bufferedAmount = 300000;
    client.push(sequence.next(samples()));
    expect(states.at(-1)).toBe("reconnecting");
    client.stop();
    client.stop();
    vi.advanceTimersByTime(60000);
    expect(sockets).toHaveLength(2);
  });
});

it("selects an exact mic with processing disabled", () => {
  expect(microphoneConstraints("usb")).toEqual({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      deviceId: { exact: "usb" },
    },
  });
});
it("does not request mic on construction, and stops a late permission grant", async () => {
  type Stream = { getTracks: () => { stop: () => void }[] };
  let grant: ((stream: Stream) => void) | undefined;
  const getUserMedia = vi.fn(
    () =>
      new Promise<Stream>((resolve) => {
        grant = resolve;
      }),
  );
  const close = vi.fn(async () => {});
  class Context {
    state = "running";
    resume = async () => {};
    close = close;
  }
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const capture = new HostCapture({
    epoch: 1,
    ingestUrl: "ws://localhost/ingest",
  });
  expect(getUserMedia).not.toHaveBeenCalled();
  const start = capture.start();
  await capture.stop();
  const stop = vi.fn();
  grant?.({ getTracks: () => [{ stop }] });
  await start;
  await capture.stop();
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(capture.getSnapshot()).toMatchObject({
    mic: "idle",
    connection: "closed",
  });
});

it("caps default resend coverage at 120 seconds", () => {
  const buffer = new ResendBuffer();
  const sequence = new FrameSequencer(1);
  for (let i = 0; i < 1201; i++) buffer.add(sequence.next(samples()));
  expect(buffer.unackedMs).toBe(120000);
  expect(buffer.localGaps).toEqual([
    { startSampleOffset: 0, endSampleOffset: 2400 },
  ]);
});

it("reports permission denial and closes the context", async () => {
  const close = vi.fn(async () => {});
  class Context {
    state = "running";
    resume = async () => {};
    close = close;
  }
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    },
  });
  const capture = new HostCapture({ epoch: 1, ingestUrl: "ws://localhost" });
  await expect(capture.start()).rejects.toThrow("denied");
  expect(capture.getSnapshot()).toMatchObject({
    mic: "denied",
    connection: "closed",
  });
  expect(close).toHaveBeenCalledOnce();
});

it("releases microphone and context when worklet loading fails", async () => {
  const close = vi.fn(async () => {});
  const stop = vi.fn();
  const track = { stop, onended: null };
  class Context {
    state = "running";
    resume = async () => {};
    close = close;
    audioWorklet = {
      addModule: async () => {
        throw new Error("load failed");
      },
    };
  }
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }),
    },
  });
  const capture = new HostCapture({ epoch: 1, ingestUrl: "ws://localhost" });
  await expect(capture.start()).rejects.toThrow("load failed");
  expect(capture.getSnapshot()).toMatchObject({
    mic: "error",
    connection: "closed",
  });
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it("maps screen time to the first worklet PCM quantum on the 24 kHz audio clock", async () => {
  const contexts: Context[] = [];
  const nodes: Worklet[] = [];
  class Context {
    state = "running";
    currentTime = 12;
    destination = {};
    constructor() {
      contexts.push(this);
    }
    resume = async () => {};
    close = async () => {};
    audioWorklet = { addModule: async () => {} };
    createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  }
  class Worklet {
    constructor() {
      nodes.push(this);
    }
    port: {
      onmessage: ((event: MessageEvent<unknown>) => void) | null;
      close: () => void;
    } = { onmessage: null, close: vi.fn() };
    connect = vi.fn();
    disconnect = vi.fn();
  }
  const track = { stop: vi.fn(), onended: null };
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("AudioWorkletNode", Worklet);
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }),
    },
  });
  const capture = new HostCapture({ epoch: 1, ingestUrl: "ws://localhost" });
  expect(capture.getCaptureSampleOffset()).toBeUndefined();
  await capture.start();
  expect(capture.getCaptureSampleOffset()).toBeUndefined();
  nodes[0]?.port.onmessage?.(
    new MessageEvent("message", { data: { clockStartTime: 10 } }),
  );
  expect(capture.getCaptureSampleOffset()).toBe(48000);
  if (contexts[0]) contexts[0].state = "suspended";
  expect(capture.getCaptureSampleOffset()).toBeUndefined();
  await capture.stop();
  expect(capture.getCaptureSampleOffset()).toBeUndefined();
});
