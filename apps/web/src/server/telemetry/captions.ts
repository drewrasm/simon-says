import {
  ROOT_CONTEXT,
  SpanStatusCode,
  type Attributes,
  type Meter,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { CaptionMetadata, CaptionTelemetry } from "../captions/telemetry";

export const CAPTION_SCOPE = "simon-says.captions";
export const SPAN_NAMES = [
  "caption.window",
  "caption.ingest",
  "caption.sse",
  "ask",
];
export const ATTRIBUTE_KEYS = [
  "operation",
  "outcome",
  "duration_ms",
  "passage_count",
  "retry_count",
  "cut_reason",
  "window_id",
  "session_id",
  "phase",
  "error_code",
  "http.request.method",
  "http.route",
  "http.response.status_code",
];

/** Rebuild rather than redact: unknown keys and unbounded strings never pass. */
export function safeAttributes(input: Attributes): Attributes {
  const output: Attributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ATTRIBUTE_KEYS.includes(key)) continue;
    if (key === "passage_count") {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 8
      )
        output[key] = value;
      continue;
    }
    if (
      ["duration_ms", "retry_count", "http.response.status_code"].includes(key)
    ) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0)
        output[key] = value;
      continue;
    }
    if (typeof value !== "string") continue;
    if (["session_id", "window_id"].includes(key)) {
      if (/^[A-Za-z0-9._-]{1,200}$/.test(value)) output[key] = value;
      continue;
    }
    const allowed: Record<string, readonly string[]> = {
      operation: ["window", "ingest", "sse"],
      outcome: ["success", "error", "cancelled"],
      cut_reason: ["pause", "short_pause", "soft_limit", "hard_limit", "stop"],
      phase: ["interim", "final"],
      error_code: ["transcription_failed", "segment_sink_failed"],
      "http.request.method": ["GET"],
      "http.route": ["/api/sessions/:id/ingest", "/api/sessions/:id/events"],
    };
    if (allowed[key]?.includes(value)) output[key] = value;
  }
  return output;
}

/** One binding per transport; no provider object, text, event or error is accepted. */
export function createCaptionTelemetry(
  tracer: Tracer,
  meter: Meter,
): CaptionTelemetry {
  const windows = new Map<string, Span>();
  const ingest = new Map<string, Span>();
  const sse = new Map<string, Span>();
  const backlog = new Map<string, number>();
  let sseCount = 0;
  meter
    .createObservableGauge("caption.ingest.backlog")
    .addCallback((result) => {
      result.observe(
        [...backlog.values()].reduce((sum, count) => sum + count, 0),
      );
    });
  meter
    .createObservableGauge("caption.sse.connections")
    .addCallback((result) => result.observe(sseCount));
  const histograms = {
    lag_ms: meter.createHistogram("caption.lag", { unit: "ms" }),
    rotation_gap_ms: meter.createHistogram("caption.rotation_gap", {
      unit: "ms",
    }),
    window_duration_ms: meter.createHistogram("caption.window.duration", {
      unit: "ms",
    }),
    es_write_latency_ms: meter.createHistogram("caption.es.write_latency", {
      unit: "ms",
    }),
  };
  const counters = {
    es_write_retries: meter.createCounter("caption.es.write_retries"),
    es_write_failures: meter.createCounter("caption.es.write_failures"),
    retries: meter.createCounter("caption.retries"),
    errors: meter.createCounter("caption.errors"),
    gaps: meter.createCounter("caption.gaps"),
  };
  function key(metadata: CaptionMetadata) {
    return `${metadata.session_id}:${metadata.window_id}`;
  }
  return (metric, value, metadata = {}) => {
    if (!Number.isFinite(value) || value < 0) return;
    const attributes = safeAttributes(metadata);
    // IDs never label metrics: bounded phase/code dimensions only.
    const labels = safeAttributes({
      phase: metadata.phase,
      error_code: metadata.error_code,
    });
    if (
      metric === "lag_ms" ||
      metric === "rotation_gap_ms" ||
      metric === "es_write_latency_ms"
    ) {
      histograms[metric].record(value, labels);
    } else if (
      metric === "es_write_retries" ||
      metric === "es_write_failures" ||
      metric === "retries" ||
      metric === "errors" ||
      metric === "gaps"
    ) {
      counters[metric].add(value, labels);
    } else if (metric === "backlog") {
      const id = key(metadata);
      if (value === 0) backlog.delete(id);
      else backlog.set(id, value);
    } else if (metric === "window_start") {
      windows.set(
        key(metadata),
        tracer.startSpan(
          "caption.window",
          { attributes: { ...attributes, operation: "window" } },
          ROOT_CONTEXT,
        ),
      );
    } else if (metric === "window_end") {
      const span = windows.get(key(metadata));
      span?.setAttributes(attributes);
      span?.setStatus({
        code:
          metadata.outcome === "error"
            ? SpanStatusCode.ERROR
            : SpanStatusCode.OK,
      });
      span?.end();
      windows.delete(key(metadata));
      histograms.window_duration_ms.record(
        metadata.duration_ms ?? 0,
        safeAttributes({ cut_reason: metadata.cut_reason }),
      );
    } else if (metric === "ingest_start" || metric === "sse_start") {
      const operation = metric === "ingest_start" ? "ingest" : "sse";
      const connections = operation === "ingest" ? ingest : sse;
      const id = metadata.connection_id ?? "";
      connections.set(
        id,
        tracer.startSpan(
          `caption.${operation}`,
          {
            attributes: {
              ...attributes,
              operation,
              "http.request.method": "GET",
              "http.route":
                operation === "ingest"
                  ? "/api/sessions/:id/ingest"
                  : "/api/sessions/:id/events",
              "http.response.status_code": operation === "ingest" ? 101 : 200,
            },
          },
          ROOT_CONTEXT,
        ),
      );
      if (operation === "sse") sseCount++;
    } else if (metric === "ingest_end" || metric === "sse_end") {
      const connections = metric === "ingest_end" ? ingest : sse;
      const id = metadata.connection_id ?? "";
      const span = connections.get(id);
      span?.end();
      connections.delete(id);
      if (metric === "sse_end" && span) sseCount = Math.max(0, sseCount - 1);
    }
  };
}
