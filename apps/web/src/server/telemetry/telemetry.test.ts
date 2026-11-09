import { createServer } from "node:http";
import { once } from "node:events";
import { inspect } from "node:util";
import { SpanStatusCode } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { MockTranscriptionModelV4 } from "ai/test";
import { WebSocket } from "ws";
import { expect, it, vi } from "vitest";
import { encodeAudioFrame } from "@simon-says/contracts/audio-frame";
import { CaptionTransport } from "../captions/transport";
import { DevIngestAuthority } from "../captions/ingest-authority";
import {
  CAPTION_SCOPE,
  ATTRIBUTE_KEYS,
  createCaptionTelemetry,
} from "./captions";
import { ContentSafeSpanProcessor, startTelemetry } from "./runtime";

function memoryTelemetry() {
  const spans = new InMemorySpanExporter();
  const metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const resource = resourceFromAttributes({ "service.name": "simon-says" });
  const traces = new TracerProvider({
    resource,
    spanProcessors: [
      new ContentSafeSpanProcessor(
        new SimpleSpanProcessor({ exporter: spans }),
        resource,
      ),
    ],
  });
  const meters = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metrics,
        exportIntervalMillis: 60000,
      }),
    ],
  });
  const tracer = traces.getTracer(CAPTION_SCOPE);
  const record = createCaptionTelemetry(tracer, meters.getMeter(CAPTION_SCOPE));
  return { spans, metrics, traces, meters, tracer, record };
}

it.each(["success", "provider failure", "rotation"])(
  "exports content-free fake-model captions over real sockets (%s)",
  async (mode) => {
    const failure = mode === "provider failure";
    const rotation = mode === "rotation";
    const marker = "PRIVATE_MARKER_7cbe871d";
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
      vi.spyOn(console, "info"),
    ];
    const telemetry = memoryTelemetry();
    let calls = 0;
    const model = new MockTranscriptionModelV4({
      doStream: async ({ audio }) => {
        calls++;
        return {
          stream: new ReadableStream({
            async start(controller) {
              try {
                const reader = audio.getReader();
                for (;;) {
                  const { done } = await reader.read();
                  if (done) break;
                  controller.enqueue({
                    type: "transcript-delta",
                    delta: marker,
                  });
                }
                if (failure) throw new Error(marker);
                controller.enqueue({ type: "transcript-final", text: marker });
                controller.enqueue({
                  type: "finish",
                  text: marker,
                  segments: [],
                });
                controller.close();
              } catch (error) {
                controller.error(error);
              }
            },
          }),
        };
      },
    });
    const written: unknown[] = [];
    const transport = new CaptionTransport({
      authority: new DevIngestAuthority("dev", false),
      model: {
        specificationVersion: "v4",
        provider: model.provider,
        modelId: model.modelId,
        doGenerate: model.doGenerate,
        doStream: model.doStream!,
      },
      telemetry: telemetry.record,
      ...(rotation
        ? {
            managerConfig: {
              planner: {
                sampleRate: 24000,
                minWindowMs: 200,
                pauseMs: 20,
                shortPauseAfterMs: 250,
                shortPauseMs: 20,
                maxWindowMs: 300,
                hardGraceMs: 20,
                prewarmLeadMs: 100,
              },
            },
          }
        : {}),
      sink: {
        kind: "elasticsearch",
        async writeSegments(segments) {
          written.push(...segments);
        },
      },
    });
    const server = createServer((req, res) => {
      if (!transport.handleHttp(req, res)) res.writeHead(404).end();
    });
    server.on("upgrade", (req, socket, head) =>
      transport.handleUpgrade(req, socket, head),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing address");
    const abort = new AbortController();
    const feed = await fetch(
      `http://127.0.0.1:${address.port}/api/sessions/dev/events`,
      { signal: abort.signal },
    );
    const ws = new WebSocket(
      `ws://127.0.0.1:${address.port}/api/sessions/dev/ingest`,
    );
    try {
      await once(ws, "open");
      const ready = once(ws, "message");
      ws.send(
        JSON.stringify({
          type: "hello",
          epoch: 1,
          lastSentSeq: 0,
          sampleRate: 24000,
        }),
      );
      await ready;
      ws.send(
        encodeAudioFrame({
          epoch: 1,
          seq: 0,
          sampleOffset: 0,
          samples: new Int16Array(2400),
        }),
      );
      await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(1));
      if (rotation) {
        for (const seq of [1, 2]) {
          ws.send(
            encodeAudioFrame({
              epoch: 1,
              seq,
              sampleOffset: seq * 2400,
              samples: new Int16Array(2400),
            }),
          );
          await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
        }
      }
      // Exercise the observable during an active connection, then again after drain.
      await telemetry.meters.forceFlush();
      await transport.close();
      if (ws.readyState !== WebSocket.CLOSED) await once(ws, "close");
      await vi.waitFor(() =>
        expect(
          telemetry.spans
            .getFinishedSpans()
            .filter((span) => span.name === "caption.sse"),
        ).toHaveLength(1),
      );
      await telemetry.traces.forceFlush();
      await telemetry.meters.forceFlush();
      if (failure) expect(calls).toBe(3);
      const spans = telemetry.spans.getFinishedSpans();
      expect(spans.map((span) => span.name)).toEqual(
        expect.arrayContaining([
          "caption.window",
          "caption.ingest",
          "caption.sse",
        ]),
      );
      expect(
        spans.find((span) => span.name === "caption.window")?.attributes,
      ).toMatchObject({
        window_id: "1-0",
        duration_ms: rotation ? 200 : 100,
        cut_reason: rotation ? "pause" : "stop",
        retry_count: failure ? 2 : 0,
        outcome: failure ? "error" : "success",
      });
      const metrics = telemetry.metrics
        .getMetrics()
        .flatMap((resource) =>
          resource.scopeMetrics.flatMap((scope) => scope.metrics),
        );
      const names = metrics.map((metric) => metric.descriptor.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "caption.ingest.backlog",
          "caption.sse.connections",
          "caption.window.duration",
          "caption.lag",
        ]),
      );
      if (rotation) expect(names).toContain("caption.rotation_gap");
      if (failure)
        expect(names).toEqual(
          expect.arrayContaining([
            "caption.errors",
            "caption.retries",
            "caption.gaps",
          ]),
        );
      else {
        expect(names).toContain("caption.es.write_latency");
        expect(JSON.stringify(written)).toContain(marker);
      }
      const latestMetrics =
        telemetry.metrics
          .getMetrics()
          .at(-1)
          ?.scopeMetrics.flatMap((scope) => scope.metrics) ?? [];
      for (const name of [
        "caption.ingest.backlog",
        "caption.sse.connections",
      ]) {
        expect(
          latestMetrics.find((metric) => metric.descriptor.name === name)
            ?.dataPoints,
        ).toMatchObject([{ value: 0 }]);
      }
      if (failure) {
        for (const [name, count] of [
          ["caption.retries", 2],
          ["caption.errors", 3],
          ["caption.gaps", 1],
        ]) {
          expect(
            latestMetrics.find((metric) => metric.descriptor.name === name)
              ?.dataPoints,
          ).toMatchObject([{ value: count }]);
        }
      }
      const phases = metrics
        .filter((metric) => metric.descriptor.name === "caption.lag")
        .flatMap((metric) =>
          metric.dataPoints.map((point) => point.attributes.phase),
        );
      expect(phases).toContain("interim");
      if (!failure) expect(phases).toContain("final");
      expect(
        metrics.every((metric) =>
          metric.dataPoints.every(
            (point) =>
              !("session_id" in point.attributes) &&
              !("window_id" in point.attributes),
          ),
        ),
      ).toBe(true);
      for (const span of spans)
        expect(
          Object.keys(span.attributes).every((key) =>
            ATTRIBUTE_KEYS.includes(key),
          ),
        ).toBe(true);
      expect(
        JSON.stringify({
          spans,
          metrics: telemetry.metrics.getMetrics(),
          logs: logs.map((log) => log.mock.calls),
        }),
      ).not.toContain(marker);
      // JSON would turn Error objects into {}, hiding a logged provider message.
      expect(
        inspect(
          logs.map((log) => log.mock.calls),
          { depth: null },
        ),
      ).not.toContain(marker);
    } finally {
      abort.abort();
      await feed.body?.cancel().catch(() => {});
      ws.terminate();
      await transport.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await telemetry.traces.shutdown();
      await telemetry.meters.shutdown();
      logs.forEach((log) => log.mockRestore());
    }
  },
);

it("removes content in attributes, events, exception status, links, resources and foreign spans", async () => {
  const telemetry = memoryTelemetry();
  try {
    const marker = "PRIVATE_MARKER_84d964";
    const span = telemetry.tracer.startSpan("caption.window", {
      attributes: {
        text: marker,
        "url.full": marker,
        outcome: marker,
        error_code: marker,
        operation: "window",
        retry_count: 2,
      },
    });
    span.recordException(new Error(marker));
    span.addEvent(marker, { body: marker });
    span.addLink({ context: span.spanContext(), attributes: { body: marker } });
    span.setStatus({ code: SpanStatusCode.ERROR, message: marker });
    span.end();
    telemetry.traces.getTracer(marker).startSpan(marker).end();
    telemetry.tracer.startSpan(marker).end();
    await telemetry.traces.forceFlush();
    expect(telemetry.spans.getFinishedSpans()).toHaveLength(1);
    expect(telemetry.spans.getFinishedSpans()[0]?.attributes).toEqual({
      operation: "window",
      retry_count: 2,
    });
    expect(JSON.stringify(telemetry.spans.getFinishedSpans())).not.toContain(
      marker,
    );
  } finally {
    await telemetry.traces.shutdown();
    await telemetry.meters.shutdown();
  }
});

it("does not initialize without an endpoint, even with other OTEL variables", () => {
  expect(
    startTelemetry(
      {
        NODE_ENV: "test",
        OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer fake",
        OTEL_TRACES_EXPORTER: "console",
      },
      "0.0.0",
    ),
  ).toBeUndefined();
});

it("sends HTTP/protobuf traces and metrics only to a local OTLP receiver", async () => {
  const requests: {
    path: string | undefined;
    type: string | undefined;
    authorization: string | undefined;
    dataset: string | string[] | undefined;
    bytes: number;
  }[] = [];
  const receiver = createServer((req, res) => {
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
    });
    req.on("end", () => {
      requests.push({
        path: req.url,
        type: req.headers["content-type"],
        authorization: req.headers.authorization,
        dataset: req.headers["dash0-dataset"],
        bytes,
      });
      res.writeHead(200, { "content-type": "application/x-protobuf" }).end();
    });
  });
  receiver.listen(0, "127.0.0.1");
  await once(receiver, "listening");
  const address = receiver.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  const runtime = startTelemetry(
    {
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${address.port}`,
      OTEL_EXPORTER_OTLP_HEADERS:
        "Authorization=Bearer local-fake-token,Dash0-Dataset=local-test",
      OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
      IMAGE_SHA: "abc123",
      DEPLOYMENT_ENVIRONMENT: "test",
    },
    "0.0.0",
  );
  try {
    expect(runtime).toBeDefined();
    runtime?.record("window_start", 1, { session_id: "dev", window_id: "1-0" });
    runtime?.record("window_end", 1, {
      session_id: "dev",
      window_id: "1-0",
      outcome: "success",
      duration_ms: 100,
      cut_reason: "stop",
    });
    await runtime?.shutdown(2000);
    expect(requests.map((request) => request.path)).toEqual(
      expect.arrayContaining(["/v1/traces", "/v1/metrics"]),
    );
    for (const request of requests)
      expect(request).toMatchObject({
        type: "application/x-protobuf",
        authorization: "Bearer local-fake-token",
        dataset: "local-test",
        bytes: expect.any(Number),
      });
    expect(requests.every((request) => request.bytes > 0)).toBe(true);
  } finally {
    await runtime?.shutdown(100);
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  }
});
