import "server-only";
import {
  HOST_RESEND_CAPACITY_MS,
  CAPTION_SAMPLE_RATE,
  type AudioFrame,
} from "@simon-says/contracts/audio-frame";

export class RingBuffer {
  private readonly frames = new Map<number, AudioFrame>();
  private latestSample = 0;
  constructor(
    private readonly capacitySamples = (HOST_RESEND_CAPACITY_MS *
      CAPTION_SAMPLE_RATE) /
      1000,
  ) {}

  hasSequence(seq: number) {
    return this.frames.has(seq);
  }

  add(frame: AudioFrame): "added" | "duplicate" | "sequence_conflict" {
    const previous = this.frames.get(frame.seq);
    if (previous) {
      return previous.epoch === frame.epoch &&
        previous.sampleOffset === frame.sampleOffset &&
        previous.samples.length === frame.samples.length &&
        previous.samples.every((sample, i) => sample === frame.samples[i])
        ? "duplicate"
        : "sequence_conflict";
    }
    this.frames.set(frame.seq, { ...frame, samples: frame.samples.slice() });
    this.latestSample = Math.max(
      this.latestSample,
      frame.sampleOffset + frame.samples.length,
    );
    const floor = this.latestSample - this.capacitySamples;
    for (const [seq, stored] of this.frames) {
      if (stored.sampleOffset + stored.samples.length <= floor)
        this.frames.delete(seq);
    }
    while (this.frames.size > 6000)
      this.frames.delete(this.frames.keys().next().value!);
    return "added";
  }

  /** Exact contiguous range, sliced at sample boundaries; null if evicted/missing. */
  replay(startSample: number, endSample: number): Int16Array[] | null {
    let offset = startSample;
    const result: Int16Array[] = [];
    for (const frame of this.frames.values()) {
      const end = frame.sampleOffset + frame.samples.length;
      if (end <= offset) continue;
      if (frame.sampleOffset > offset) return null;
      const until = Math.min(end, endSample);
      result.push(
        frame.samples.slice(
          offset - frame.sampleOffset,
          until - frame.sampleOffset,
        ),
      );
      offset = until;
      if (offset === endSample) break;
    }
    return offset === endSample ? result : null;
  }
}
