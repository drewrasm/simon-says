import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createFrameUpload,
  devFrameAccess,
  InMemoryObservationSink,
  MAX_FRAME_BYTES,
} from "./upload";
const bytes = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
  "base64",
);
const metadata = {
  epoch: 1,
  seq: 0,
  captureSampleOffset: 24000,
  width: 1,
  height: 1,
  mimeType: "image/webp",
  checksum: createHash("sha256").update(bytes).digest("hex"),
  captureState: "live",
};
function request(patch = {}, body = bytes, headers = {}) {
  return new Request("http://localhost/api/sessions/demo/frames", {
    method: "POST",
    headers: {
      "Content-Type": "image/webp",
      "X-Frame-Metadata": JSON.stringify({ ...metadata, ...patch }),
      ...headers,
    },
    body,
  });
}
function setup() {
  const sink = new InMemoryObservationSink();
  const put = vi.fn().mockResolvedValue(undefined);
  const upload = createFrameUpload({
    access: devFrameAccess({ CAPTIONS_DEV_SESSION: "demo" }),
    store: { put },
    sink,
  });
  return { sink, put, upload };
}
describe("frame endpoint", () => {
  it("stores and deduplicates simultaneous retries with deterministic identity and time", async () => {
    const { upload, put, sink } = setup();
    const responses = await Promise.all([
      upload(request(), "demo"),
      upload(request(), "demo"),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await responses[0]!.json()).toEqual({ observationId: "frame-0" });
    expect(put).toHaveBeenCalledTimes(1);
    expect(sink.observations.get("demo:1:frame-0")).toMatchObject({
      captureMs: 1000,
      objectKey: `sessions/demo/frames/1/0-${metadata.checksum}.webp`,
    });
    expect(
      (await upload(request({ captureSampleOffset: 48000 }), "demo")).status,
    ).toBe(409);
  });
  it("rejects schema, size, checksum, signature, auth and stale epoch before writes", async () => {
    const { upload, put } = setup();
    expect((await upload(request({ width: 0 }), "demo")).status).toBe(400);
    expect(
      (
        await upload(
          request({}, bytes, { "Content-Length": String(MAX_FRAME_BYTES + 1) }),
          "demo",
        )
      ).status,
    ).toBe(413);
    expect(
      (await upload(request({}, Buffer.alloc(MAX_FRAME_BYTES + 1)), "demo"))
        .status,
    ).toBe(413);
    expect(
      (await upload(request({ checksum: "0".repeat(64) }), "demo")).status,
    ).toBe(400);
    expect((await upload(request({ epoch: 2 }), "demo")).status).toBe(409);
    expect((await upload(request(), "other")).status).toBe(403);
    expect(
      (
        await upload(
          request({}, bytes, { Origin: "https://evil.example" }),
          "demo",
        )
      ).status,
    ).toBe(403);
    const junk = Buffer.from("not an image");
    expect(
      (
        await upload(
          request(
            { checksum: createHash("sha256").update(junk).digest("hex") },
            junk,
          ),
          "demo",
        )
      ).status,
    ).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });
  it("fails closed in production and without explicit dev opt-in", async () => {
    for (const env of [
      {},
      { NODE_ENV: "production", CAPTIONS_DEV_SESSION: "demo" },
    ])
      expect(await devFrameAccess(env).authorize(request(), "demo", 1)).toBe(
        "unauthorized",
      );
  });
  it("allows retry after sink failure without acknowledging missing observations", async () => {
    const sink = {
      put: vi
        .fn()
        .mockRejectedValueOnce(new Error())
        .mockResolvedValue(undefined),
    };
    const put = vi.fn().mockResolvedValue(undefined);
    const upload = createFrameUpload({
      access: devFrameAccess({ CAPTIONS_DEV_SESSION: "demo" }),
      store: { put },
      sink,
    });
    expect((await upload(request(), "demo")).status).toBe(503);
    expect((await upload(request(), "demo")).status).toBe(200);
    expect(put).toHaveBeenCalledTimes(2);
  });
});

vi.mock("server-only", () => ({}));
