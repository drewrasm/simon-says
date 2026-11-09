import { z } from "zod";

/**
 * JSON text messages on the host ingest WebSocket. Audio travels as binary
 * frames (see `audio-frame`); these messages negotiate and acknowledge it.
 */

const epoch = z.number().int().min(1).max(0xffff_ffff);
const seq = z.number().int().min(0).max(0xffff_ffff);

/** Host → server: first message after connecting or reconnecting. */
export const ingestHelloSchema = z.object({
  type: z.literal("hello"),
  epoch,
  /** Highest sequence the host still holds unacknowledged, or -1 for none. */
  lastSentSeq: z.number().int().min(-1).max(0xffff_ffff),
  sampleRate: z.literal(24_000),
});

export const hostIngestMessageSchema = z.discriminatedUnion("type", [
  ingestHelloSchema,
]);

/** Server → host: ingest accepted; resend everything after `ackedThroughSeq`. */
export const ingestReadySchema = z.object({
  type: z.literal("ready"),
  epoch,
  ackedThroughSeq: z.number().int().min(-1).max(0xffff_ffff),
});

/** Server → host: frames through `throughSeq` are durably received. */
export const ingestAckSchema = z.object({
  type: z.literal("ack"),
  epoch,
  throughSeq: seq,
});

export const ingestRejectReasonSchema = z.enum([
  "unauthorized",
  "stale_epoch",
  "session_ended",
  "invalid_frame",
  "sequence_conflict",
  "overloaded",
]);

/** Server → host: ingest refused. The host stops sending unless `retryable`. */
export const ingestRejectedSchema = z.object({
  type: z.literal("rejected"),
  reason: ingestRejectReasonSchema,
  retryable: z.boolean(),
});

export const serverIngestMessageSchema = z.discriminatedUnion("type", [
  ingestReadySchema,
  ingestAckSchema,
  ingestRejectedSchema,
]);

export type IngestHello = z.infer<typeof ingestHelloSchema>;
export type HostIngestMessage = z.infer<typeof hostIngestMessageSchema>;
export type IngestReady = z.infer<typeof ingestReadySchema>;
export type IngestAck = z.infer<typeof ingestAckSchema>;
export type IngestRejectReason = z.infer<typeof ingestRejectReasonSchema>;
export type IngestRejected = z.infer<typeof ingestRejectedSchema>;
export type ServerIngestMessage = z.infer<typeof serverIngestMessageSchema>;
