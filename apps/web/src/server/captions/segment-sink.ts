import "server-only";
import {
  segmentDocumentId,
  type TranscriptSegment,
} from "@simon-says/contracts/caption";

export interface SegmentSink {
  readonly kind?: "elasticsearch";
  /** Resolve only after the implementation's persistence boundary completes. */
  writeSegments(segments: readonly TranscriptSegment[]): Promise<void>;
}

/** Development/test fallback; process-local and not durable. */
export class InMemorySegmentSink implements SegmentSink {
  readonly segments = new Map<string, TranscriptSegment>();
  async writeSegments(segments: readonly TranscriptSegment[]): Promise<void> {
    if (this.segments.size + segments.length > 10000)
      throw new Error("development_sink_capacity");
    for (const segment of segments) {
      const previous = this.segments.get(segmentDocumentId(segment));
      if (previous && JSON.stringify(previous) !== JSON.stringify(segment)) {
        throw new Error("segment_revision_conflict");
      }
    }
    for (const segment of segments)
      this.segments.set(segmentDocumentId(segment), segment);
  }
}
