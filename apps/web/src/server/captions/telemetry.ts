import type { CutReason } from "@simon-says/domain/caption-windows";

/** Content-free numeric metrics only; Dash0 binding is a separate change. */
export type CaptionMetric =
  | "lag_ms"
  | "rotation_gap_ms"
  | "window_duration_ms"
  | "retries"
  | "errors"
  | "backlog"
  | `window_cut_${CutReason}`;
export type CaptionTelemetry = (metric: CaptionMetric, value: number) => void;
