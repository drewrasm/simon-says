import { afterEach, expect, it, vi } from "vitest";
import { errors } from "@elastic/elasticsearch";
import type {
  TranscriptSegment,
  CaptionEvent,
} from "@simon-says/contracts/caption";
import {
  ElasticsearchSegmentSink,
  type SegmentWriteClient,
} from "./elasticsearch-segment-sink";
import { CaptionAssembler } from "../captions/assembler";
import { EventHub } from "../captions/event-hub";

const segment: TranscriptSegment = {
  sessionId: "local",
  epoch: 1,
  windowId: "1-0",
  segmentId: "1-0-0",
  revision: 1,
  startMs: 0,
  endMs: 100,
  text: "Synthetic caption.",
  provenance: "live",
  timing: { kind: "estimated", uncertaintyMs: 10 },
};
function mockClient(statuses = [201]) {
  const bulk = vi.fn<SegmentWriteClient["bulk"]>().mockResolvedValue({
    errors: statuses.some((status) => status >= 300),
    took: 1,
    items: statuses.map((status) => ({
      create: { _index: "segments-v1", status },
    })),
  });
  const get = vi.fn<SegmentWriteClient["get"]>().mockResolvedValue({
    _index: "segments-v1",
    _id: "local:1:1-0-0:1",
    _version: 1,
    found: true,
    _source: segment,
  });
  return { bulk, get };
}
afterEach(() => vi.useRealTimers());
it("uses create-only bulk, exact document fields and deterministic IDs without refresh", async () => {
  const client = mockClient();
  await new ElasticsearchSegmentSink(client).writeSegments([segment]);
  expect(client.bulk.mock.calls[0]?.[0]).toEqual({
    refresh: false,
    require_alias: true,
    operations: [
      { create: { _index: "simon-says-segments", _id: "local:1:1-0-0:1" } },
      segment,
    ],
  });
});
it("accepts identical 409 with semantic/lifecycle metadata and different key order", async () => {
  const client = mockClient([409]);
  client.get.mockResolvedValue({
    _index: "segments-v1",
    _id: "id",
    found: true,
    _source: {
      expiresAt: "2026-11-10T00:00:00Z",
      text_semantic: {},
      ...segment,
      timing: { uncertaintyMs: 10, kind: "estimated" },
    },
  });
  await expect(
    new ElasticsearchSegmentSink(client).writeSegments([segment]),
  ).resolves.toBeUndefined();
  expect(client.get.mock.calls[0]?.[0]).toEqual({
    index: "simon-says-segments",
    id: "local:1:1-0-0:1",
    realtime: true,
  });
});
it.each(["text", "startMs", "windowId", "timing"])(
  "rejects conflicting 409: %s",
  async (field) => {
    const client = mockClient([409]);
    client.get.mockResolvedValue({
      _index: "segments-v1",
      _id: "id",
      found: true,
      _source: { ...segment, [field]: "different" },
    });
    await expect(
      new ElasticsearchSegmentSink(client).writeSegments([segment]),
    ).rejects.toThrow("segment_sink_failed");
    expect(client.bulk).toHaveBeenCalledTimes(1);
  },
);
it.each([429, 503, "network", "no-living-connections"])(
  "retries transient %s then succeeds with numeric telemetry",
  async (status) => {
    vi.useFakeTimers();
    const client = mockClient();
    if (status === "network")
      client.bulk.mockRejectedValueOnce(
        new errors.ConnectionError("private source"),
      );
    else if (status === "no-living-connections")
      client.bulk.mockRejectedValueOnce(
        new errors.NoLivingConnectionsError("unavailable", {
          warnings: null,
          meta: {
            context: null,
            name: "test",
            request: {
              params: { method: "POST", path: "/_bulk" },
              options: {},
              id: 1,
            },
            connection: null,
            attempts: 0,
            aborted: false,
          },
        }),
      );
    else
      client.bulk.mockResolvedValueOnce({
        errors: true,
        took: 1,
        items: [{ create: { _index: "segments-v1", status: Number(status) } }],
      });
    const telemetry = vi.fn();
    const promise = new ElasticsearchSegmentSink(
      client,
      telemetry,
    ).writeSegments([segment]);
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
it("replays partial bulk success and verifies the already-created revision", async () => {
  vi.useFakeTimers();
  const client = mockClient([409, 201]);
  client.bulk.mockResolvedValueOnce({
    errors: true,
    took: 1,
    items: [
      { create: { _index: "segments-v1", status: 201 } },
      { create: { _index: "segments-v1", status: 429 } },
    ],
  });
  const promise = new ElasticsearchSegmentSink(client).writeSegments([
    segment,
    { ...segment, segmentId: "second" },
  ]);
  await vi.runAllTimersAsync();
  await promise;
  expect(client.get).toHaveBeenCalledTimes(1);
});
it("does not retry permanent mapping failures or expose response content", async () => {
  const client = mockClient([400]);
  const telemetry = vi.fn();
  await expect(
    new ElasticsearchSegmentSink(client, telemetry).writeSegments([segment]),
  ).rejects.toThrow("segment_sink_failed");
  expect(client.bulk).toHaveBeenCalledTimes(1);
  expect(telemetry).toHaveBeenCalledWith("es_write_failures", 1);
});
it("exhausts a bounded budget into degraded state and an exact-range pipeline gap", async () => {
  vi.useFakeTimers();
  const client = mockClient([503]);
  const telemetry = vi.fn();
  const hub = new EventHub("local");
  const events: CaptionEvent[] = [];
  hub.subscribe((event) => events.push(event));
  const assembler = new CaptionAssembler(
    hub,
    new ElasticsearchSegmentSink(client, telemetry, 350),
    1,
  );
  const promise = assembler.complete({
    index: 0,
    windowId: "window",
    range: { startMs: 100, endMs: 300 },
    text: "Synthetic.",
    deltas: [],
    lagMs: 20,
  });
  await vi.runAllTimersAsync();
  await promise;
  expect(client.bulk).toHaveBeenCalledTimes(3);
  expect(events.slice(1)).toEqual([
    expect.objectContaining({
      kind: "capture.state",
      session: "degraded",
      reason: "segment_sink_failed",
    }),
    expect.objectContaining({ kind: "caption.gap", startMs: 100, endMs: 300 }),
  ]);
  expect(telemetry).toHaveBeenCalledWith("es_write_failures", 1);
});

it("aborts an in-flight request at the total deadline and reports one failure", async () => {
  vi.useFakeTimers();
  const client = mockClient();
  client.bulk.mockImplementation(
    (_params, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new errors.RequestAbortedError("aborted")),
          { once: true },
        );
      }),
  );
  const telemetry = vi.fn();
  const assertion = expect(
    new ElasticsearchSegmentSink(client, telemetry, 250).writeSegments([
      segment,
    ]),
  ).rejects.toThrow("segment_sink_failed");
  await vi.advanceTimersByTimeAsync(250);
  await assertion;
  expect(client.bulk).toHaveBeenCalledTimes(1);
  expect(telemetry).toHaveBeenCalledWith("es_write_failures", 1);
});
