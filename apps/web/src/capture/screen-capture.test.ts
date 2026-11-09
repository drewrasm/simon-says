import { describe, expect, it, vi } from "vitest";
import {
  encodeScreenFrame,
  FrameChanges,
  frameDimensions,
  FrameUploadQueue,
  FrameUploadError,
} from "./screen-capture";
const item = {
  metadata: {
    epoch: 1,
    seq: 0,
    captureSampleOffset: 0,
    width: 800,
    height: 600,
    mimeType: "image/webp",
    checksum: "a".repeat(64),
    captureState: "live",
  },
  blob: new Blob(["frame"], { type: "image/webp" }),
} satisfies Parameters<FrameUploadQueue["enqueue"]>[0];
describe("screen capture primitives", () => {
  it("preserves aspect ratio without upscaling, including code-screen resolutions", () => {
    expect(frameDimensions(3840, 2160)).toEqual({ width: 1600, height: 900 });
    expect(frameDimensions(1920, 1200)).toEqual({ width: 1600, height: 1000 });
    expect(frameDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(() => frameDimensions(0, 600)).toThrow();
  });
  it("skips consecutive checksums and retries content after a failed upload", () => {
    const changes = new FrameChanges();
    expect(changes.changed("a")).toBe(true);
    expect(changes.changed("a")).toBe(false);
    expect(changes.changed("b")).toBe(true);
    changes.reset();
    expect(changes.changed("b")).toBe(true);
  });
  it("retries twice with backoff and reports success", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockRejectedValueOnce(new Error())
      .mockResolvedValue(undefined);
    const success = vi.fn();
    const failure = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    const queue = new FrameUploadQueue(send, success, failure, wait);
    queue.enqueue(item);
    await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[250], [500]]);
    expect(failure).toHaveBeenCalledTimes(2);
  });
  it("bounds pending frames and aborts in-flight uploads on stop", async () => {
    let signal: AbortSignal | undefined;
    const failure = vi.fn();
    const queue = new FrameUploadQueue(
      async (_, received) => {
        signal = received;
        await new Promise<void>(() => {});
      },
      vi.fn(),
      failure,
    );
    expect(queue.enqueue(item)).toBe(true);
    expect(queue.enqueue(item)).toBe(true);
    expect(queue.enqueue(item)).toBe(true);
    expect(queue.enqueue(item)).toBe(false);
    expect(failure).toHaveBeenCalledTimes(1);
    queue.close();
    expect(signal?.aborted).toBe(true);
  });
});

it.each([null, new Blob(["png"], { type: "image/png" })])(
  "falls back to JPEG when WebP is unavailable (%s)",
  async (webp) => {
    const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });
    const toBlob = vi.fn((callback: BlobCallback, type?: string) =>
      callback(type === "image/webp" ? webp : jpeg),
    );
    expect(await encodeScreenFrame({ toBlob })).toBe(jpeg);
    expect(toBlob.mock.calls.map((call) => call[1])).toEqual([
      "image/webp",
      "image/jpeg",
    ]);
  },
);

it.each([400, 403, 409, 413])(
  "does not retry terminal HTTP %s and continues the queue",
  async (status) => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new FrameUploadError(status))
      .mockResolvedValue(undefined);
    const success = vi.fn();
    const failure = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    const queue = new FrameUploadQueue(send, success, failure, wait);
    queue.enqueue(item);
    queue.enqueue(item);
    await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledTimes(2);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  },
);

it.each([429, 503])("retries transient HTTP %s", async (status) => {
  const send = vi
    .fn()
    .mockRejectedValueOnce(new FrameUploadError(status))
    .mockResolvedValue(undefined);
  const success = vi.fn();
  const wait = vi.fn().mockResolvedValue(undefined);
  const queue = new FrameUploadQueue(send, success, vi.fn(), wait);
  queue.enqueue(item);
  await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1));
  expect(send).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledWith(250);
});
