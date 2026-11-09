import { trace } from "@opentelemetry/api";
import {
  resourceFromAttributes,
  type Resource,
} from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import {
  CAPTION_SCOPE,
  SPAN_NAMES,
  createCaptionTelemetry,
  safeAttributes,
} from "./captions";

/** Last export boundary: foreign scopes, arbitrary names, events, links, status
 * descriptions, tracestate and detected resource attributes are never forwarded. */
export class ContentSafeSpanProcessor implements SpanProcessor {
  constructor(
    private readonly downstream: SpanProcessor,
    private readonly resource: Resource,
  ) {}
  onStart() {}
  onEnd(span: ReadableSpan) {
    if (
      span.instrumentationScope.name !== CAPTION_SCOPE ||
      !SPAN_NAMES.includes(span.name)
    )
      return;
    const context = span.spanContext();
    this.downstream.onEnd({
      name: span.name,
      kind: span.kind,
      spanContext: () => ({
        traceId: context.traceId,
        spanId: context.spanId,
        traceFlags: context.traceFlags,
      }),
      startTime: span.startTime,
      endTime: span.endTime,
      duration: span.duration,
      ended: span.ended,
      status: { code: span.status.code },
      attributes: safeAttributes(span.attributes),
      events: [],
      links: [],
      resource: this.resource,
      instrumentationScope: { name: CAPTION_SCOPE },
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    });
  }
  forceFlush() {
    return this.downstream.forceFlush();
  }
  shutdown() {
    return this.downstream.shutdown();
  }
}

/** Disabled without the base endpoint. Startup does no network I/O. */
export function startTelemetry(
  env: Readonly<Record<string, string | undefined>>,
  packageVersion: string,
) {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return undefined;
  try {
    if (
      env.OTEL_EXPORTER_OTLP_PROTOCOL &&
      env.OTEL_EXPORTER_OTLP_PROTOCOL !== "http/protobuf"
    )
      throw new Error("unsupported_protocol");
    const endpoint = new URL(env.OTEL_EXPORTER_OTLP_ENDPOINT);
    if (
      !["http:", "https:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error("invalid_endpoint");
    const headers: Record<string, string> = {};
    for (const entry of (env.OTEL_EXPORTER_OTLP_HEADERS ?? "").split(",")) {
      if (!entry.trim()) continue;
      const separator = entry.indexOf("=");
      if (separator < 1) throw new Error("invalid_header");
      headers[entry.slice(0, separator).trim()] = decodeURIComponent(
        entry.slice(separator + 1).trim(),
      );
    }
    const resource = resourceFromAttributes({
      "service.name": "simon-says",
      "service.version": env.IMAGE_SHA || packageVersion,
      "deployment.environment.name":
        env.DEPLOYMENT_ENVIRONMENT || env.NODE_ENV || "development",
    });
    const url = endpoint.toString().replace(/\/$/, "");
    const processor = new ContentSafeSpanProcessor(
      new BatchSpanProcessor({
        exporter: new OTLPTraceExporter({
          url: `${url}/v1/traces`,
          headers,
          timeoutMillis: 1000,
        }),
        exportTimeoutMillis: 1500,
      }),
      resource,
    );
    // Private MeterProvider avoids exporting incidental framework/provider metrics.
    const meters = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: `${url}/v1/metrics`,
            headers,
            timeoutMillis: 1000,
          }),
          exportIntervalMillis: 10000,
          exportTimeoutMillis: 1500,
        }),
      ],
    });
    const sdk = new NodeSDK({
      resource,
      autoDetectResources: false,
      instrumentations: [],
      spanProcessors: [processor],
      metricReaders: [],
      logRecordProcessors: [],
      textMapPropagator: null,
    });
    sdk.start();
    return {
      record: createCaptionTelemetry(
        trace.getTracer(CAPTION_SCOPE),
        meters.getMeter(CAPTION_SCOPE),
      ),
      async shutdown(budgetMs: number) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            Promise.all([sdk.shutdown(), meters.shutdown()]),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, budgetMs);
            }),
          ]);
        } catch {
          console.error("telemetry: shutdown failed");
        } finally {
          clearTimeout(timer);
        }
      },
    };
  } catch {
    console.error("telemetry: disabled due to invalid configuration");
    return undefined;
  }
}
