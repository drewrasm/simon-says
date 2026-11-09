import type { CutReason } from "@simon-says/domain/caption-windows";

/** No content or raw errors may cross this boundary. IDs are opaque. */
export type CaptionMetadata = {
  session_id?: string;
  /** Internal correlation only; stripped from exported attributes. */
  connection_id?: string;
  window_id?: string;
  cut_reason?: CutReason | "stop";
  retry_count?: number;
  duration_ms?: number;
  outcome?: "success" | "error" | "cancelled";
  phase?: "interim" | "final";
  error_code?: "transcription_failed" | "segment_sink_failed";
};
export type CaptionMetric =
  | "lag_ms"
  | "rotation_gap_ms"
  | "window_duration_ms"
  | "es_write_latency_ms"
  | "retries"
  | "errors"
  | "gaps"
  | "backlog"
  | "window_start"
  | "window_end"
  | "ingest_start"
  | "ingest_end"
  | "sse_start"
  | "sse_end"
  | `window_cut_${CutReason}`;
export type CaptionTelemetry = (
  metric: CaptionMetric,
  value: number,
  metadata?: CaptionMetadata,
) => void;
