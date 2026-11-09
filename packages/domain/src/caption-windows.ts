import type { AnalysisUnit } from "./audio-level";

/**
 * Decides when to rotate live transcription windows.
 *
 * Each window is one provider streaming call. The AI SDK stream ends at its
 * first final transcript, so long talks run as consecutive windows. Cuts aim
 * for pauses so words stay whole, in tiers: a 300 ms pause after 15 s, a
 * 150 ms pause after 20 s, a speech low point after 25 s, and a hard cut at
 * 27 s. Only the last two tiers can split a word; the decision records the
 * tier so callers can measure how often that happens. A cut takes effect at
 * the end of the analysis unit that triggered it: every sample before
 * `cutSample` belongs to the current window, every sample after to the next.
 */

export type WindowPlannerConfig = {
  sampleRate: number;
  /** Earliest rotation; shorter windows waste connections and context. */
  minWindowMs: number;
  /** Quiet run required to cut between minWindowMs and maxWindowMs. */
  pauseMs: number;
  /** After this, a shorter quiet run (a breath) is enough. */
  shortPauseAfterMs: number;
  shortPauseMs: number;
  /** After this, cut at the first quiet-ish unit. */
  maxWindowMs: number;
  /** Absolute limit after maxWindowMs; cut even mid-speech. */
  hardGraceMs: number;
  /** Signal to pre-open the next window this long before minWindowMs. */
  prewarmLeadMs: number;
};

export const DEFAULT_WINDOW_PLANNER_CONFIG: Omit<
  WindowPlannerConfig,
  "sampleRate"
> = {
  minWindowMs: 15_000,
  pauseMs: 300,
  shortPauseAfterMs: 20_000,
  shortPauseMs: 150,
  maxWindowMs: 25_000,
  hardGraceMs: 2_000,
  prewarmLeadMs: 1_000,
};

export type CutReason = "pause" | "short_pause" | "soft_limit" | "hard_limit";

export type WindowDecision =
  | { kind: "prewarm"; atSample: number }
  | { kind: "cut"; cutSample: number; reason: CutReason };

const RECENT_UNITS = 50; // 1 s of 20 ms units

export class WindowPlanner {
  private readonly config: WindowPlannerConfig;
  private windowStartSample: number;
  private quietRunSamples = 0;
  private lastUnitEnd: number | null = null;
  private prewarmed = false;
  private recentDbfs: number[] = [];

  constructor(config: WindowPlannerConfig, startSample = 0) {
    if (config.pauseMs <= 0 || config.minWindowMs >= config.maxWindowMs) {
      throw new RangeError("invalid window planner config");
    }
    this.config = config;
    this.windowStartSample = startSample;
  }

  get currentWindowStartSample(): number {
    return this.windowStartSample;
  }

  /** Feed analysis units in order; returns decisions they trigger. */
  push(units: readonly AnalysisUnit[]): WindowDecision[] {
    const decisions: WindowDecision[] = [];
    for (const unit of units) {
      const decision = this.consider(unit);
      if (decision) decisions.push(...decision);
    }
    return decisions;
  }

  /** Start a new window explicitly, for example after a reconnect. */
  reset(startSample: number): void {
    this.windowStartSample = startSample;
    this.quietRunSamples = 0;
    this.prewarmed = false;
    this.recentDbfs = [];
  }

  private ms(samples: number): number {
    return (samples * 1_000) / this.config.sampleRate;
  }

  private consider(unit: AnalysisUnit): WindowDecision[] | null {
    const { config } = this;
    // A quiet run never spans a gap in the audio.
    if (this.lastUnitEnd !== null && unit.startSample !== this.lastUnitEnd) {
      this.quietRunSamples = 0;
    }
    this.lastUnitEnd = unit.endSample;
    this.quietRunSamples = unit.quiet
      ? this.quietRunSamples + (unit.endSample - unit.startSample)
      : 0;
    this.recentDbfs.push(unit.dbfs);
    if (this.recentDbfs.length > RECENT_UNITS) this.recentDbfs.shift();

    const elapsedMs = this.ms(unit.endSample - this.windowStartSample);
    const out: WindowDecision[] = [];

    if (
      !this.prewarmed &&
      elapsedMs >= config.minWindowMs - config.prewarmLeadMs
    ) {
      this.prewarmed = true;
      out.push({ kind: "prewarm", atSample: unit.endSample });
    }

    let reason: CutReason | null = null;
    if (elapsedMs >= config.maxWindowMs + config.hardGraceMs) {
      reason = "hard_limit";
    } else if (
      elapsedMs >= config.maxWindowMs &&
      (unit.quiet || this.isQuietest(unit.dbfs))
    ) {
      reason = "soft_limit";
    } else if (
      elapsedMs >= config.minWindowMs &&
      this.ms(this.quietRunSamples) >= config.pauseMs
    ) {
      reason = "pause";
    } else if (
      elapsedMs >= config.shortPauseAfterMs &&
      this.ms(this.quietRunSamples) >= config.shortPauseMs
    ) {
      reason = "short_pause";
    }

    if (reason) {
      if (!this.prewarmed)
        out.push({ kind: "prewarm", atSample: unit.endSample });
      out.push({ kind: "cut", cutSample: unit.endSample, reason });
      this.reset(unit.endSample);
    }
    return out.length > 0 ? out : null;
  }

  /**
   * A low point in speech: in the quietest quarter of the last second and at
   * least 3 dB under its median. Steady audio has no low point, so it runs on
   * to the hard limit instead of cutting at an arbitrary unit.
   */
  private isQuietest(dbfs: number): boolean {
    if (this.recentDbfs.length < 10) return false;
    const sorted = [...this.recentDbfs].sort((a, b) => a - b);
    const quarter = sorted[Math.floor(sorted.length * 0.25)]!;
    const median = sorted[Math.floor(sorted.length * 0.5)]!;
    return dbfs <= quarter && dbfs <= median - 3;
  }
}
