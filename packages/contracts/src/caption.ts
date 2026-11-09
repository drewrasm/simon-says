import { z } from "zod";
import { sessionStatusSchema } from "@simon-says/contracts/session-status";

/**
 * Transcript segments and the shared caption event feed (SSE).
 * All times are session-relative milliseconds on the host source clock.
 */

/**
 * Identifiers that compose into document IDs. Letters, digits, `.`, `_` and
 * `-` only, so the `:` separator in document IDs cannot be forged.
 */
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+$/, "use letters, digits, '.', '_' or '-'");
/** Opaque cursor; never composed into other IDs. */
const cursor = z.string().min(1).max(200);
const ms = z.number().nonnegative();
const epoch = z.number().int().min(1);

export const transcriptProvenanceSchema = z.enum([
  "live",
  "corrected",
  "repaired",
]);

/**
 * How a segment's time range was derived. Live provider deltas carry no
 * timestamps, so ranges are estimated from audio offsets sent and arrival lag.
 */
export const segmentTimingSchema = z.object({
  kind: z.literal("estimated"),
  /** Half-width of the plausible error around `startMs` and `endMs`. */
  uncertaintyMs: ms,
});

export const transcriptSegmentSchema = z
  .object({
    sessionId: id,
    epoch,
    /** Transcription window that produced the segment. */
    windowId: id,
    /** Stable segment ID, unique within the session. */
    segmentId: id,
    revision: z.number().int().min(1),
    startMs: ms,
    endMs: ms,
    timing: segmentTimingSchema,
    text: z.string().max(10_000),
    provenance: transcriptProvenanceSchema,
  })
  .refine((segment) => segment.endMs >= segment.startMs, {
    message: "endMs must not precede startMs",
    path: ["endMs"],
  });

/** Deterministic Elasticsearch document ID; retries and replays reuse it. */
export function segmentDocumentId(
  segment: Pick<
    TranscriptSegment,
    "sessionId" | "epoch" | "segmentId" | "revision"
  >,
): string {
  return `${segment.sessionId}:${segment.epoch}:${segment.segmentId}:${segment.revision}`;
}

const eventBase = {
  /** Opaque, monotonically ordered replay cursor. */
  cursor,
  sessionId: id,
};

/** Live, unstored text for a window; replaced wholesale by later events. */
export const captionInterimEventSchema = z
  .object({
    ...eventBase,
    kind: z.literal("caption.interim"),
    epoch,
    windowId: id,
    text: z.string().max(10_000),
    startMs: ms,
    estimatedEndMs: ms,
  })
  .refine((event) => event.estimatedEndMs >= event.startMs, {
    message: "estimatedEndMs must not precede startMs",
    path: ["estimatedEndMs"],
  });

/** Final segments for a window; supersede that window's interim text. */
export const captionFinalEventSchema = z
  .object({
    ...eventBase,
    kind: z.literal("caption.final"),
    epoch,
    windowId: id,
    segments: z.array(transcriptSegmentSchema).max(500),
  })
  .refine(
    (event) =>
      event.segments.every(
        (segment) =>
          segment.sessionId === event.sessionId &&
          segment.epoch === event.epoch &&
          segment.windowId === event.windowId,
      ),
    {
      message: "segments must belong to the event's session, epoch and window",
      path: ["segments"],
    },
  );

export const captionGapReasonSchema = z.enum([
  "transcription_failed",
  "audio_missing",
]);

/** A source range with no transcript; never reported as caught up. */
export const captionGapEventSchema = z
  .object({
    ...eventBase,
    kind: z.literal("caption.gap"),
    epoch,
    startMs: ms,
    endMs: ms,
    reason: captionGapReasonSchema,
  })
  .refine((event) => event.endMs >= event.startMs, {
    message: "endMs must not precede startMs",
    path: ["endMs"],
  });

export const captureStateEventSchema = z.object({
  ...eventBase,
  kind: z.literal("capture.state"),
  /** Expired sessions deny stream access, so the feed never reports `expired`. */
  session: sessionStatusSchema.exclude(["expired"]),
  audio: z.enum(["receiving", "stalled", "stopped"]),
  /** Lag from audio receipt to final caption; null before the first final. */
  captionLagMs: ms.nullable(),
  /** Content-free degradation reason; never a provider error message. */
  reason: z
    .enum([
      "missing_provider_key",
      "missing_elasticsearch_config",
      "transcription_failed",
      "segment_sink_failed",
      "backlog_limit",
    ])
    .optional(),
});

export const clockHeartbeatEventSchema = z.object({
  ...eventBase,
  kind: z.literal("clock.heartbeat"),
  /** Latest source-clock time received from the host. */
  sourceMs: ms,
});

export const captionEventSchema = z.discriminatedUnion("kind", [
  captionInterimEventSchema,
  captionFinalEventSchema,
  captionGapEventSchema,
  captureStateEventSchema,
  clockHeartbeatEventSchema,
]);

export type TranscriptProvenance = z.infer<typeof transcriptProvenanceSchema>;
export type SegmentTiming = z.infer<typeof segmentTimingSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type CaptionInterimEvent = z.infer<typeof captionInterimEventSchema>;
export type CaptionFinalEvent = z.infer<typeof captionFinalEventSchema>;
export type CaptionGapReason = z.infer<typeof captionGapReasonSchema>;
export type CaptionGapEvent = z.infer<typeof captionGapEventSchema>;
export type CaptureStateEvent = z.infer<typeof captureStateEventSchema>;
export type ClockHeartbeatEvent = z.infer<typeof clockHeartbeatEventSchema>;
export type CaptionEvent = z.infer<typeof captionEventSchema>;
