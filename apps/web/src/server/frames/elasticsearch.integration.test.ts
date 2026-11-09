import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { parseEnv } from "node:util";
import { Client } from "@elastic/elasticsearch";
import { ElasticsearchObservationSink } from "../search/elasticsearch-observation-sink";
import {
  observationDocumentId,
  screenObservationSchema,
} from "@simon-says/contracts/screen";
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
  ObservationConflictError,
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
it("local ES + SeaweedFS: uploads a frame before persisting exact mapped fields and range-queryable time", async (context) => {
  if (process.env.ES_LOCAL_INTEGRATION !== "1") {
    context.skip(
      "Local observation integration disabled; run pnpm es:test:local (localhost:9200 only).",
    );
    return;
  }
  const local = parseEnv(
    await readFile(`${homedir()}/simon-says-elastic-local/.env`, "utf8"),
  );
  const node = local.ES_LOCAL_URL?.replace(
    "${ES_LOCAL_PORT}",
    local.ES_LOCAL_PORT ?? "",
  );
  if (node !== "http://localhost:9200" || !local.ES_LOCAL_API_KEY)
    throw new Error(
      "Expected local Elasticsearch credentials at localhost:9200.",
    );
  const es = new Client({
    node,
    auth: { apiKey: local.ES_LOCAL_API_KEY },
    maxRetries: 0,
    requestTimeout: 1000,
  });
  try {
    await es.info();
  } catch {
    await es.close();
    context.skip(
      "Local Elasticsearch unreachable at http://localhost:9200; start ~/simon-says-elastic-local/start.sh.",
    );
    return;
  }
  try {
    await fetch(env.S3_ENDPOINT, { signal: AbortSignal.timeout(1000) });
  } catch {
    console.info(
      "SKIP local SeaweedFS unavailable at 127.0.0.1:19000; run pnpm services:up",
    );
    await es.close();
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
  const sink = new ElasticsearchObservationSink(es);
  const upload = createFrameUpload({
    access: devFrameAccess(env, "http://localhost"),
    store: s3FrameStore(env),
    sink,
  });
  const metadata = {
    epoch: 1,
    seq: Date.now() % 0xffff_ffff,
    captureSampleOffset: 24001,
    width: 1,
    height: 1,
    mimeType: "image/webp",
    checksum,
    captureState: "live",
  };
  let key: string | undefined;
  let id: string | undefined;
  try {
    const response = await upload(
      new Request("http://localhost/api/sessions/s4-integration/frames", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "image/webp",
          "X-Frame-Metadata": JSON.stringify(metadata),
        },
        body: bytes,
      }),
      env.CAPTIONS_DEV_SESSION,
      "127.0.0.1",
    );
    expect(response.status).toBe(200);
    const observation = screenObservationSchema.parse({
      ...metadata,
      sessionId: env.CAPTIONS_DEV_SESSION,
      observationId: `frame-${metadata.seq}`,
      frameId: `frame-${metadata.seq}`,
      captureMs: metadata.captureSampleOffset / 24,
      objectKey: `sessions/${env.CAPTIONS_DEV_SESSION}/frames/1/${metadata.seq}-${checksum}.webp`,
      glossaryTerms: [],
      expiresAt: null,
    });
    id = observationDocumentId(observation);
    key = observation.objectKey;
    const storedObservation = await es.get({
      index: "simon-says-observations",
      id,
    });
    const expected = {
      sessionId: observation.sessionId,
      observationId: observation.observationId,
      frameId: observation.frameId,
      epoch: 1,
      width: 1,
      height: 1,
      checksum,
      objectKey: key,
      captureState: "live",
      captureMs: 1000,
      glossaryTerms: [],
      expiresAt: null,
    };
    expect(storedObservation._source).toEqual(expected);
    await sink.put(observation); // Real 409 verifies identical mapped content.
    await expect(
      sink.put({ ...observation, checksum: "0".repeat(64) }),
    ).rejects.toThrow(ObservationConflictError);
    // A fresh handler bypasses process-local deduplication and exercises real ES 409s.
    for (const conflicting of [false, true]) {
      const restartedUpload = createFrameUpload({
        access: devFrameAccess(env, "http://localhost"),
        store: s3FrameStore(env),
        sink,
      });
      const replay = await restartedUpload(
        new Request("http://localhost/api/sessions/s4-integration/frames", {
          method: "POST",
          headers: {
            Origin: "http://localhost",
            "Content-Type": "image/webp",
            "X-Frame-Metadata": JSON.stringify({
              ...metadata,
              captureSampleOffset:
                metadata.captureSampleOffset + (conflicting ? 24 : 0),
            }),
          },
          body: bytes,
        }),
        env.CAPTIONS_DEV_SESSION,
        "127.0.0.1",
      );
      expect(replay.status).toBe(conflicting ? 409 : 200);
      expect(await replay.json()).toEqual(
        conflicting
          ? { error: "observation_conflict" }
          : { observationId: observation.observationId },
      );
    }
    await es.indices.refresh({ index: "simon-says-observations" });
    const found = await es.search({
      index: "simon-says-observations",
      query: {
        bool: {
          filter: [
            { ids: { values: [id] } },
            { range: { captureMs: { gte: 1000, lt: 1001 } } },
          ],
        },
      },
    });
    expect(found.hits.hits.map((hit) => hit._id)).toEqual([id]);
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
      "PASS local ES + SeaweedFS: real upload handler, deterministic ID, exact strict mapping, null expiry, captureMs range query, identical/conflicting 409, signed object byte readback, anonymous 403",
    );
  } finally {
    if (key)
      await client.send(
        new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
      );
    if (id)
      await es.delete({ index: "simon-says-observations", id, refresh: true });
    await es.close();
    client.destroy();
  }
}, 20_000);

vi.mock("server-only", () => ({}));
