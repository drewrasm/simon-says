import {
  CAPTION_SAMPLE_RATE,
  FRAME_SAMPLES,
  HOST_RESEND_CAPACITY_MS,
  sampleOffsetToMs,
  type AudioFrame,
} from "@simon-says/contracts/audio-frame";

export type LocalGap = Readonly<{
  startSampleOffset: number;
  endSampleOffset: number;
}>;

export class FrameSequencer {
  private seq = 0;
  private offset = 0;
  constructor(private readonly epoch: number) {
    if (!Number.isInteger(epoch) || epoch < 1 || epoch > 0xffff_ffff)
      throw new RangeError("Invalid epoch");
  }
  next(samples: Int16Array): AudioFrame {
    if (samples.length !== FRAME_SAMPLES)
      throw new RangeError("Expected one complete audio frame");
    if (this.offset + samples.length > 0xffff_ffff || this.seq > 0xffff_ffff)
      throw new RangeError("Source clock exhausted; acquire a new epoch");
    const frame = {
      epoch: this.epoch,
      seq: this.seq++,
      sampleOffset: this.offset,
      samples,
    };
    this.offset += samples.length;
    return frame;
  }
}

export class ResendBuffer {
  private frames: AudioFrame[] = [];
  private gaps: LocalGap[] = [];
  constructor(private readonly capacityMs = HOST_RESEND_CAPACITY_MS) {}
  add(frame: AudioFrame): void {
    this.frames.push(frame);
    while (
      this.frames.length * FRAME_SAMPLES >
      (this.capacityMs * CAPTION_SAMPLE_RATE) / 1000
    ) {
      const dropped = this.frames.shift()!;
      const endSampleOffset = dropped.sampleOffset + dropped.samples.length;
      const previous = this.gaps.at(-1);
      if (previous?.endSampleOffset === dropped.sampleOffset) {
        this.gaps[this.gaps.length - 1] = {
          startSampleOffset: previous.startSampleOffset,
          endSampleOffset,
        };
      } else
        this.gaps.push({
          startSampleOffset: dropped.sampleOffset,
          endSampleOffset,
        });
    }
  }
  acknowledge(seq: number): void {
    this.frames = this.frames.filter((frame) => frame.seq > seq);
  }
  after(seq: number): readonly AudioFrame[] {
    return this.frames.filter((frame) => frame.seq > seq);
  }
  get newestSeq(): number {
    return this.frames.at(-1)?.seq ?? -1;
  }
  get unackedMs(): number {
    return sampleOffsetToMs(this.frames.length * FRAME_SAMPLES);
  }
  get localGaps(): readonly LocalGap[] {
    return this.gaps.slice();
  }
}

/** Equal jitter, capped at 15 seconds even after long outages. */
export function reconnectDelay(attempt: number, random = Math.random): number {
  const cap = Math.min(15_000, 500 * 2 ** Math.min(30, Math.max(0, attempt)));
  return cap * (0.5 + random() * 0.5);
}
