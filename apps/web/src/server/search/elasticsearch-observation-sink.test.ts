import {
  FrameUploadError,
  FrameUploadQueue,
} from "../../capture/screen-capture";
import { createHash } from "node:crypto";
import { errors } from "@elastic/elasticsearch";
import { afterEach, expect, it, vi } from "vitest";
import type { ScreenObservation } from "@simon-says/contracts/screen";
import {
  ElasticsearchObservationSink,
  type ObservationWriteClient,
} from "./elasticsearch-observation-sink";
import {
  createFrameUpload,
  devFrameAccess,
  ObservationConflictError,
} from "../frames/upload";

const bytes = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
  "base64",
);
const observation: ScreenObservation = {
  sessionId: "local",
  epoch: 1,
  observationId: "frame-0",
  frameId: "frame-0",
  seq: 0,
  captureSampleOffset: 24001,
  captureMs: 24001 / 24,
  width: 1,
  height: 1,
  mimeType: "image/webp",
  captureState: "live",
  checksum: createHash("sha256").update(bytes).digest("hex"),
  objectKey: "sessions/local/frames/1/frame.webp",
  glossaryTerms: [],
  expiresAt: null,
};
const { seq, captureSampleOffset, mimeType, ...fields } = observation;
const document = { ...fields, captureMs: 1000 };
function mockClient(status = 201) {
  return {
    bulk: vi.fn<ObservationWriteClient["bulk"]>().mockResolvedValue({
      errors: status >= 300,
      took: 1,
      items: [{ create: { _index: "observations-v1", status } }],
    }),
    get: vi.fn<ObservationWriteClient["get"]>().mockResolvedValue({
      _index: "observations-v1",
      _id: "local:1:frame-0",
      found: true,
      _source: document,
    }),
  };
}
afterEach(() => vi.useRealTimers());
it("creates only exact mapped fields with deterministic ID and whole milliseconds", async () => {
  const client = mockClient();
  await new ElasticsearchObservationSink(client).put(observation);
  expect(client.bulk.mock.calls[0]?.[0]).toEqual({
    refresh: false,
    require_alias: true,
    operations: [
      { create: { _index: "simon-says-observations", _id: "local:1:frame-0" } },
      document,
    ],
  });
});
it("accepts an identical 409", async () => {
  const client = mockClient(409);
  await expect(
    new ElasticsearchObservationSink(client).put(observation),
  ).resolves.toBeUndefined();
  expect(client.get.mock.calls[0]?.[0]).toEqual({
    index: "simon-says-observations",
    id: "local:1:frame-0",
    realtime: true,
  });
});
it.each([
  "checksum",
  "captureMs",
  "objectKey",
  "expiresAt",
  "frameId",
  "epoch",
  "glossaryTerms",
])("rejects conflicting 409 for %s", async (field) => {
  const client = mockClient(409);
  client.get.mockResolvedValue({
    _index: "observations-v1",
    _id: "local:1:frame-0",
    found: true,
    _source: { ...document, [field]: "different" },
  });
  await expect(
    new ElasticsearchObservationSink(client).put(observation),
  ).rejects.toThrow(ObservationConflictError);
  expect(client.bulk).toHaveBeenCalledTimes(1);
});
it.each([429, 503, "network"])(
  "retries %s with content-free numeric telemetry",
  async (status) => {
    vi.useFakeTimers();
    const client = mockClient();
    if (status === "network")
      client.bulk.mockRejectedValueOnce(new errors.ConnectionError("private"));
    else
      client.bulk.mockResolvedValueOnce({
        errors: true,
        took: 1,
        items: [
          { create: { _index: "observations-v1", status: Number(status) } },
        ],
      });
    const telemetry = vi.fn();
    const promise = new ElasticsearchObservationSink(client, telemetry).put(
      observation,
    );
    await vi.runAllTimersAsync();
    await promise;
    expect(client.bulk).toHaveBeenCalledTimes(2);
    expect(telemetry).toHaveBeenCalledWith("es_write_retries", 1);
    expect(telemetry).toHaveBeenCalledWith(
      "es_write_latency_ms",
      expect.any(Number),
    );
  },
);
it("exhausts its retry budget into upload 503 after object storage, and permits retry", async () => {
  vi.useFakeTimers();
  const client = mockClient(503);
  const store = { put: vi.fn().mockResolvedValue(undefined) };
  const telemetry = vi.fn();
  client.bulk.mockImplementation(async () => {
    expect(store.put).toHaveBeenCalled();
    return {
      errors: true,
      took: 1,
      items: [{ create: { _index: "observations-v1", status: 503 } }],
    };
  });
  const upload = createFrameUpload({
    access: devFrameAccess(
      { CAPTIONS_DEV_SESSION: "local" },
      "http://localhost",
    ),
    store,
    sink: new ElasticsearchObservationSink(client, telemetry, 350),
  });
  const request = () =>
    new Request("http://localhost/api/sessions/local/frames", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": mimeType,
        "X-Frame-Metadata": JSON.stringify({
          epoch: 1,
          seq,
          captureSampleOffset,
          mimeType,
          width: 1,
          height: 1,
          captureState: "live",
          checksum: observation.checksum,
        }),
      },
      body: bytes,
    });
  const promise = upload(request(), "local", "127.0.0.1");
  await vi.runAllTimersAsync();
  const response = await promise;
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "frame_persistence_unavailable",
  });
  expect(client.bulk).toHaveBeenCalledTimes(3);
  expect(telemetry).toHaveBeenCalledWith("es_write_failures", 1);
  client.bulk.mockResolvedValue({
    errors: false,
    took: 1,
    items: [{ create: { _index: "observations-v1", status: 201 } }],
  });
  expect((await upload(request(), "local", "127.0.0.1")).status).toBe(200);
});
it("aborts in-flight writes at the total budget", async () => {
  vi.useFakeTimers();
  const client = mockClient();
  client.bulk.mockImplementation(
    (_params, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener(
          "abort",
          () => reject(new errors.RequestAbortedError("private")),
          { once: true },
        ),
      ),
  );
  const assertion = expect(
    new ElasticsearchObservationSink(client, undefined, 250).put(observation),
  ).rejects.toThrow("observation_sink_failed");
  await vi.advanceTimersByTimeAsync(250);
  await assertion;
});

it.each([false, true])(
  "maps a stored observation conflict to terminal 409 (different source: %s)",
  async (conflicting) => {
    const client = mockClient(409);
    client.get.mockImplementation(async () => {
      const stored = {
        ...document,
        objectKey: `sessions/local/frames/1/0-${observation.checksum}.webp`,
      };
      return {
        _index: "observations-v1",
        _id: "local:1:frame-0",
        found: true,
        _source: conflicting ? { ...stored, checksum: "0".repeat(64) } : stored,
      };
    });
    const upload = createFrameUpload({
      access: devFrameAccess(
        { CAPTIONS_DEV_SESSION: "local" },
        "http://localhost",
      ),
      store: { put: vi.fn().mockResolvedValue(undefined) },
      sink: new ElasticsearchObservationSink(client),
    });
    const metadata = {
      epoch: 1,
      seq,
      captureSampleOffset,
      mimeType,
      width: 1,
      height: 1,
      captureState: "live",
      checksum: observation.checksum,
    } satisfies Parameters<FrameUploadQueue["enqueue"]>[0]["metadata"];
    const send = vi.fn(async () => {
      const response = await upload(
        new Request("http://localhost/api/sessions/local/frames", {
          method: "POST",
          headers: {
            Origin: "http://localhost",
            "Content-Type": mimeType,
            "X-Frame-Metadata": JSON.stringify(metadata),
          },
          body: bytes,
        }),
        "local",
        "127.0.0.1",
      );
      expect(response.status).toBe(conflicting ? 409 : 200);
      expect(await response.json()).toEqual(
        conflicting
          ? { error: "sequence_conflict" }
          : { observationId: "frame-0" },
      );
      if (!response.ok) throw new FrameUploadError(response.status);
    });
    const success = vi.fn();
    const failure = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    const queue = new FrameUploadQueue(send, success, failure, wait);
    queue.enqueue({ metadata, blob: new Blob([bytes], { type: mimeType }) });
    await vi.waitFor(() =>
      expect(conflicting ? failure : success).toHaveBeenCalledTimes(1),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(client.bulk).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  },
);
