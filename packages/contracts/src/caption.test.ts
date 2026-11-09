import { describe, expect, it } from "vitest";
import {
  captionEventSchema,
  segmentDocumentId,
  transcriptSegmentSchema,
  type TranscriptSegment,
} from "./caption";
import { hostIngestMessageSchema, serverIngestMessageSchema } from "./ingest";

const segment: TranscriptSegment = {
  sessionId: "s1",
  epoch: 2,
  windowId: "w7",
  segmentId: "w7-0",
  revision: 1,
  startMs: 14_000,
  endMs: 17_250,
  timing: { kind: "estimated", uncertaintyMs: 1_500 },
  text: "Run kubectl apply with the deployment file.",
  provenance: "live",
};

describe("caption contracts", () => {
  it("derives deterministic document IDs", () => {
    expect(segmentDocumentId(segment)).toBe("s1:2:w7-0:1");
    expect(segmentDocumentId({ ...segment, revision: 2 })).toBe("s1:2:w7-0:2");
  });

  it("keeps document IDs unambiguous by forbidding the separator", () => {
    expect(
      transcriptSegmentSchema.safeParse({ ...segment, sessionId: "a:1:b" })
        .success,
    ).toBe(false);
    expect(
      transcriptSegmentSchema.safeParse({ ...segment, segmentId: "b:2:c" })
        .success,
    ).toBe(false);
  });

  it("rejects final events carrying another window's segments", () => {
    const final = {
      cursor: "c1",
      sessionId: "s1",
      kind: "caption.final",
      epoch: 2,
      windowId: "w7",
      segments: [segment],
    };
    expect(captionEventSchema.safeParse(final).success).toBe(true);
    for (const foreign of [
      { ...segment, sessionId: "s2" },
      { ...segment, epoch: 3 },
      { ...segment, windowId: "w8" },
    ]) {
      expect(
        captionEventSchema.safeParse({ ...final, segments: [foreign] }).success,
      ).toBe(false);
    }
  });

  it("rejects segments that end before they start", () => {
    expect(
      transcriptSegmentSchema.safeParse({ ...segment, endMs: 1 }).success,
    ).toBe(false);
  });

  it("parses each caption event kind", () => {
    const base = { cursor: "c1", sessionId: "s1" };
    const events = [
      {
        ...base,
        kind: "caption.interim",
        epoch: 2,
        windowId: "w7",
        text: "Run kube",
        startMs: 14_000,
        estimatedEndMs: 15_100,
      },
      {
        ...base,
        kind: "caption.final",
        epoch: 2,
        windowId: "w7",
        segments: [segment],
      },
      {
        ...base,
        kind: "caption.gap",
        epoch: 2,
        startMs: 30_000,
        endMs: 52_000,
        reason: "transcription_failed",
      },
      {
        ...base,
        kind: "capture.state",
        session: "degraded",
        audio: "stalled",
        captionLagMs: null,
      },
      { ...base, kind: "clock.heartbeat", sourceMs: 60_000 },
    ];
    for (const event of events) {
      expect(captionEventSchema.parse(event)).toEqual(event);
    }
    expect(
      captionEventSchema.safeParse({ ...base, kind: "bookmark.saved" }).success,
    ).toBe(false);
    // Inverted ranges are rejected on every range-carrying event.
    expect(
      captionEventSchema.safeParse({ ...events[0], estimatedEndMs: 1 }).success,
    ).toBe(false);
    expect(
      captionEventSchema.safeParse({ ...events[2], endMs: 1 }).success,
    ).toBe(false);
  });

  it("validates ingest control messages", () => {
    expect(
      hostIngestMessageSchema.parse({
        type: "hello",
        epoch: 2,
        lastSentSeq: -1,
        sampleRate: 24_000,
      }).type,
    ).toBe("hello");
    expect(
      hostIngestMessageSchema.safeParse({
        type: "hello",
        epoch: 2,
        lastSentSeq: -1,
        sampleRate: 16_000,
      }).success,
    ).toBe(false);
    expect(
      serverIngestMessageSchema.parse({
        type: "rejected",
        reason: "stale_epoch",
        retryable: false,
      }).type,
    ).toBe("rejected");
  });
});
