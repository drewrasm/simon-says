/**
 * Speech/quiet classification for PCM16 audio, used to place window cuts at
 * pauses. Pure and allocation-light: callers feed frames in source order.
 */

export const ANALYSIS_UNIT_MS = 20;
const SILENCE_DBFS = -100;
/** 5 s of 20 ms units for the rolling noise-floor estimate. */
const FLOOR_WINDOW_UNITS = 250;
/** Keep the default floor until 0.5 s of audio has been seen. */
const FLOOR_MIN_UNITS = 25;

export type AnalysisUnit = {
  /** First sample of the unit on the session source clock. */
  startSample: number;
  /** One past the last sample. */
  endSample: number;
  dbfs: number;
  quiet: boolean;
};

export type QuietDetectorOptions = {
  sampleRate: number;
  /** Quiet when at least this far below the speech level estimate. */
  marginDb?: number;
  /** Never treat audio louder than this as quiet. */
  maxQuietDbfs?: number;
  /** Always treat audio quieter than this as quiet. */
  minQuietDbfs?: number;
};

export function rmsDbfs(
  samples: Int16Array,
  start = 0,
  end = samples.length,
): number {
  const count = end - start;
  if (count <= 0) return SILENCE_DBFS;
  let sum = 0;
  for (let i = start; i < end; i++) {
    const value = samples[i]! / 32_768;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / count);
  return rms > 0 ? Math.max(SILENCE_DBFS, 20 * Math.log10(rms)) : SILENCE_DBFS;
}

/**
 * Splits frames into 20 ms units and classifies each as quiet or speech.
 * The noise floor is the 10th percentile of the last 5 s of unit levels, so
 * it follows a room hum or hot preamp up and down without locking in after
 * silence, and continuous speech (whose quietest tenth is still syllable
 * troughs) does not become the floor.
 */
export class QuietDetector {
  private readonly unitSamples: number;
  private readonly marginDb: number;
  private readonly maxQuietDbfs: number;
  private readonly minQuietDbfs: number;
  private noiseFloorDbfs = -60;
  private recentLevels: number[] = [];
  private pending: Int16Array;
  private pendingCount = 0;
  private pendingStartSample: number | null = null;

  constructor(options: QuietDetectorOptions) {
    this.unitSamples = Math.round(
      (options.sampleRate * ANALYSIS_UNIT_MS) / 1_000,
    );
    this.marginDb = options.marginDb ?? 10;
    this.maxQuietDbfs = options.maxQuietDbfs ?? -35;
    this.minQuietDbfs = options.minQuietDbfs ?? -55;
    this.pending = new Int16Array(this.unitSamples);
  }

  get thresholdDbfs(): number {
    return Math.min(
      this.maxQuietDbfs,
      Math.max(this.minQuietDbfs, this.noiseFloorDbfs + this.marginDb),
    );
  }

  /**
   * Feed one frame; returns the complete 20 ms units it closed. A frame that
   * does not continue where the previous one ended (a gap or an overlap)
   * discards the partial unit, so units never span a discontinuity.
   */
  push(sampleOffset: number, samples: Int16Array): AnalysisUnit[] {
    const units: AnalysisUnit[] = [];
    const expected =
      this.pendingStartSample === null
        ? null
        : this.pendingStartSample + this.pendingCount;
    if (expected !== sampleOffset) {
      this.pendingStartSample = sampleOffset;
      this.pendingCount = 0;
      // Audio across a gap is not one room; relearn the floor.
      if (expected !== null) this.recentLevels = [];
    }
    let index = 0;
    while (index < samples.length) {
      const take = Math.min(
        this.unitSamples - this.pendingCount,
        samples.length - index,
      );
      this.pending.set(
        samples.subarray(index, index + take),
        this.pendingCount,
      );
      this.pendingCount += take;
      index += take;
      if (this.pendingCount === this.unitSamples) {
        units.push(this.closeUnit());
        this.pendingStartSample = sampleOffset + index;
      }
    }
    return units;
  }

  private closeUnit(): AnalysisUnit {
    const startSample = this.pendingStartSample ?? 0;
    const dbfs = rmsDbfs(this.pending, 0, this.unitSamples);
    const quiet = dbfs <= this.thresholdDbfs;
    this.recentLevels.push(dbfs);
    if (this.recentLevels.length > FLOOR_WINDOW_UNITS)
      this.recentLevels.shift();
    if (this.recentLevels.length >= FLOOR_MIN_UNITS) {
      const sorted = [...this.recentLevels].sort((a, b) => a - b);
      this.noiseFloorDbfs = sorted[Math.floor(sorted.length * 0.1)]!;
    }
    this.pendingCount = 0;
    return {
      startSample,
      endSample: startSample + this.unitSamples,
      dbfs,
      quiet,
    };
  }
}
