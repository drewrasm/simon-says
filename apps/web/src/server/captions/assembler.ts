import "server-only";
import {
  estimateInterimEndMs,
  timeSentences,
  type TimedDelta,
  type WindowRange,
} from "@simon-says/domain/caption-timing";
import {
  captionEventSchema,
  type TranscriptSegment,
} from "@simon-says/contracts/caption";
import { EventHub } from "./event-hub";
import type { SegmentSink } from "./segment-sink";

export type WindowResult = {
  index: number;
  windowId: string;
  range: WindowRange;
  text: string;
  deltas: TimedDelta[];
  lagMs: number;
  failed?: boolean;
};

export class CaptionAssembler {
  private next = 0;
  private enabled = true;
  private readonly completed = new Map<number, WindowResult>();
  private draining: Promise<void> = Promise.resolve();
  constructor(
    private readonly hub: EventHub,
    private readonly sink: SegmentSink,
    private readonly epoch: number,
  ) {}

  cancel() {
    this.enabled = false;
    this.completed.clear();
  }

  get backlog() {
    return this.completed.size;
  }

  interim(
    windowId: string,
    range: WindowRange,
    text: string,
    sentThroughMs: number,
    lagMs: number,
  ) {
    this.hub.publish({
      kind: "caption.interim",
      epoch: this.epoch,
      windowId,
      text,
      startMs: range.startMs,
      estimatedEndMs: estimateInterimEndMs(range, sentThroughMs, lagMs),
    });
  }

  complete(result: WindowResult): Promise<void> {
    this.completed.set(result.index, result);
    this.draining = this.draining.then(() => this.drain());
    return this.draining;
  }

  private async drain() {
    while (this.enabled && this.completed.has(this.next)) {
      const result = this.completed.get(this.next)!;
      this.completed.delete(this.next++);
      if (result.failed) {
        this.gap(result);
        continue;
      }
      const segments: TranscriptSegment[] = timeSentences(
        result.text,
        result.range,
        result.deltas,
        { lagMs: result.lagMs },
      ).map((sentence) => ({
        sessionId: this.hub.sessionId,
        epoch: this.epoch,
        windowId: result.windowId,
        segmentId: `${result.windowId}-${sentence.index}`,
        revision: 1,
        startMs: sentence.startMs,
        endMs: sentence.endMs,
        text: sentence.text,
        provenance: "live",
        timing: { kind: "estimated", uncertaintyMs: sentence.uncertaintyMs },
      }));
      try {
        // Validate before persistence as well as before publication.
        const event = {
          kind: "caption.final" as const,
          epoch: this.epoch,
          windowId: result.windowId,
          segments,
        };
        captionEventSchema.parse({
          ...event,
          sessionId: this.hub.sessionId,
          cursor: "validation",
        });
        await this.sink.writeSegments(segments);
        if (this.enabled) this.hub.publish(event);
      } catch {
        if (!this.enabled) return;
        this.hub.publish({
          kind: "capture.state",
          session: "degraded",
          audio: "receiving",
          captionLagMs: result.lagMs,
          reason: "segment_sink_failed",
        });
        this.gap(result);
      }
    }
  }

  private gap(result: WindowResult) {
    this.hub.publish({
      kind: "caption.gap",
      epoch: this.epoch,
      ...result.range,
      reason: "transcription_failed",
    });
  }
}
