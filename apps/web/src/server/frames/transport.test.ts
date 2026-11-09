import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { FrameTransport } from "./transport";
import {
  createFrameUpload,
  devFrameAccess,
  InMemoryObservationSink,
  MAX_FRAME_BYTES,
} from "./upload";

vi.mock("server-only", () => ({}));

it("routes real HTTP uploads on a random port before the Next fallback", async () => {
  const env = { CAPTIONS_DEV_SESSION: "http-test" };
  const put = vi.fn().mockResolvedValue(undefined);
  const sink = new InMemoryObservationSink();
  let current: FrameTransport;
  const server = createServer((req, res) => {
    if (current.handleHttp(req, res, req.socket.remoteAddress)) return;
    res.writeHead(418).end("Next fallback");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const base = `http://127.0.0.1:${address.port}`;
  const transport = new FrameTransport(env, base, () =>
    createFrameUpload({
      access: devFrameAccess(env, base),
      store: { put },
      sink,
    }),
  );
  const disabled = new FrameTransport({}, base);
  const production = new FrameTransport(
    { ...env, NODE_ENV: "production" },
    base,
  );
  current = transport;
  const url = `${base}/api/sessions/http-test/frames`;
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
  const headers = {
    "Content-Type": "image/webp",
    "X-Frame-Metadata": JSON.stringify(metadata),
    Origin: base,
  };
  try {
    const response = await fetch(url, { method: "POST", headers, body: bytes });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ observationId: "frame-0" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(sink.observations.get("http-test:1:frame-0")?.objectKey).toBe(
      `sessions/http-test/frames/1/0-${metadata.checksum}.webp`,
    );
    expect(
      (await fetch(url, { method: "POST", headers, body: bytes })).status,
    ).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
    expect((await fetch(url)).status).toBe(405);
    expect((await fetch(`${base}/unrelated`)).status).toBe(418);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, Origin: "https://evil.example" },
          body: bytes,
        })
      ).status,
    ).toBe(403);
    const withoutOrigin = new Headers(headers);
    withoutOrigin.delete("Origin");
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: withoutOrigin,
          body: bytes,
        })
      ).status,
    ).toBe(403);
    // No Content-Length: exercise streaming limit and preserve the 413 socket.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_FRAME_BYTES + 1));
        controller.close();
      },
    });
    const init = { method: "POST", headers, body, duplex: "half" };
    expect((await fetch(url, init)).status).toBe(413);
    for (current of [disabled, production])
      expect(
        (await fetch(url, { method: "POST", headers, body: bytes })).status,
      ).toBe(404);
    expect(put).toHaveBeenCalledTimes(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
