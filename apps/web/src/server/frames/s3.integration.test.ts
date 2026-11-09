import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { expect, it, vi } from "vitest";
import { s3FrameStore } from "./s3";
import {
  createFrameUpload,
  devFrameAccess,
  InMemoryObservationSink,
} from "./upload";

// Hardcoded loopback and local Compose credentials: never reads cloud configuration.
const env = {
  S3_ENDPOINT: "http://127.0.0.1:19000",
  S3_BUCKET: "simon-says",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "simon-says-local",
  S3_SECRET_ACCESS_KEY: "local-simon-says-storage",
  S3_FORCE_PATH_STYLE: "true",
  CAPTIONS_DEV_SESSION: "s4-integration",
};
it("stores a frame in local SeaweedFS, reads it signed, and denies anonymous reads", async (context) => {
  try {
    await fetch(env.S3_ENDPOINT, { signal: AbortSignal.timeout(1000) });
  } catch {
    console.info(
      "SKIP local SeaweedFS unavailable at 127.0.0.1:19000; run pnpm services:up",
    );
    context.skip();
    return;
  }
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
  });
  const bytes = Buffer.from(
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
    "base64",
  );
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const sink = new InMemoryObservationSink();
  const upload = createFrameUpload({
    access: devFrameAccess(env),
    store: s3FrameStore(env),
    sink,
  });
  const metadata = {
    epoch: 1,
    seq: Date.now() % 0xffff_ffff,
    captureSampleOffset: 24000,
    width: 1,
    height: 1,
    mimeType: "image/webp",
    checksum,
    captureState: "live",
  };
  let key: string | undefined;
  try {
    const response = await upload(
      new Request("http://localhost/api/sessions/s4-integration/frames", {
        method: "POST",
        headers: {
          "Content-Type": "image/webp",
          "X-Frame-Metadata": JSON.stringify(metadata),
        },
        body: bytes,
      }),
      env.CAPTIONS_DEV_SESSION,
    );
    expect(response.status).toBe(200);
    key = Array.from(sink.observations.values())[0]?.objectKey;
    expect(key).toBeTruthy();
    const stored = await client.send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    expect(Buffer.from(await stored.Body!.transformToByteArray())).toEqual(
      bytes,
    );
    expect(
      (await fetch(`${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`)).status,
    ).toBe(403);
    console.info(
      "PASS local SeaweedFS: endpoint upload, signed byte readback, anonymous 403",
    );
  } finally {
    if (key)
      await client.send(
        new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
      );
    client.destroy();
  }
}, 20_000);

vi.mock("server-only", () => ({}));
