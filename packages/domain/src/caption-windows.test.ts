import { describe, expect, it } from "vitest";
import { QuietDetector, rmsDbfs } from "./audio-level";
import {
  DEFAULT_WINDOW_PLANNER_CONFIG,
  WindowPlanner,
  type WindowDecision,
} from "./caption-windows";
import { frames, synthesize, type Span } from "./test-audio";

const RATE = 24_000;
const FRAME = 2_400;

function run(spans: Span[]) {
  const audio = synthesize(spans, RATE);
  const detector = new QuietDetector({ sampleRate: RATE });
  const planner = new WindowPlanner({
    ...DEFAULT_WINDOW_PLANNER_CONFIG,
    sampleRate: RATE,
  });
  const decisions: WindowDecision[] = [];
  for (const frame of frames(audio, FRAME)) {
    decisions.push(
      ...planner.push(detector.push(frame.sampleOffset, frame.samples)),
    );
  }
  const cuts = decisions.flatMap((d) => (d.kind === "cut" ? [d] : []));
  return {
    decisions,
    cuts,
    cutMs: cuts.map((c) => (c.cutSample * 1_000) / RATE),
  };
}

/** Speech with short 120 ms breaths, which must never trigger a cut. */
function talk(ms: number): Span[] {
  const spans: Span[] = [];
  for (let t = 0; t < ms; t += 2_120) {
    spans.push(
      { ms: Math.min(2_000, ms - t), kind: "speech" },
      { ms: 120, kind: "quiet" },
    );
  }
  return spans;
}

describe("QuietDetector", () => {
  it("measures level in dBFS", () => {
    expect(rmsDbfs(new Int16Array(480))).toBe(-100);
    expect(rmsDbfs(new Int16Array(480).fill(16_384))).toBeCloseTo(-6.02, 1);
  });

  it("classifies tones as speech and the noise floor as quiet", () => {
    const detector = new QuietDetector({ sampleRate: RATE });
    const audio = synthesize(
      [
        { ms: 1_000, kind: "quiet" },
        { ms: 1_000, kind: "speech" },
      ],
      RATE,
    );
    const units = [...frames(audio, FRAME)].flatMap((f) =>
      detector.push(f.sampleOffset, f.samples),
    );
    expect(units).toHaveLength(100);
    expect(units.slice(0, 50).every((u) => u.quiet)).toBe(true);
    expect(units.slice(55).every((u) => !u.quiet)).toBe(true);
    expect(units[1]!.startSample).toBe(480);
  });
});

describe("QuietDetector noise floor", () => {
  it("re-learns a louder room after digital silence", () => {
    const detector = new QuietDetector({ sampleRate: RATE });
    const silence = new Int16Array(RATE);
    const hum = new Int16Array(RATE * 10).map((_, i) =>
      Math.round(100 * Math.sin(i / 3)),
    );
    detector.push(0, silence);
    const units = detector.push(RATE, hum);
    // After the 5 s floor window turns over, the hum reads as quiet again.
    expect(units.slice(-100).every((u) => u.quiet)).toBe(true);
  });

  it("does not learn continuous speech as the floor", () => {
    const detector = new QuietDetector({ sampleRate: RATE });
    const audio = synthesize([{ ms: 20_000, kind: "speech" }], RATE);
    const units = [...frames(audio, FRAME)].flatMap((f) =>
      detector.push(f.sampleOffset, f.samples),
    );
    const quietShare =
      units.slice(250).filter((u) => u.quiet).length / (units.length - 250);
    expect(quietShare).toBeLessThan(0.05);
  });
});

describe("QuietDetector discontinuities", () => {
  it("restarts units at a sample-offset gap instead of spanning it", () => {
    const detector = new QuietDetector({ sampleRate: RATE });
    const audio = synthesize([{ ms: 100, kind: "speech" }], RATE);
    // 300 samples leaves a partial unit pending, then the stream jumps ahead.
    expect(detector.push(0, audio.subarray(0, 300))).toEqual([]);
    const units = detector.push(48_000, audio.subarray(0, 960));
    expect(units.map((u) => u.startSample)).toEqual([48_000, 48_480]);
  });

  it("keeps unit alignment across odd-sized contiguous frames", () => {
    const detector = new QuietDetector({ sampleRate: RATE });
    const audio = synthesize([{ ms: 100, kind: "speech" }], RATE);
    const first = detector.push(0, audio.subarray(0, 700));
    const second = detector.push(700, audio.subarray(700, 1_440));
    expect([...first, ...second].map((u) => u.startSample)).toEqual([
      0, 480, 960,
    ]);
  });
});

describe("WindowPlanner", () => {
  it("cuts at the first real pause after the minimum window", () => {
    const { decisions, cuts, cutMs } = run([
      ...talk(16_000),
      { ms: 600, kind: "quiet" },
      ...talk(5_000),
    ]);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.reason).toBe("pause");
    // Inside the 600 ms pause that starts around 16.0–16.2 s.
    expect(cutMs[0]).toBeGreaterThan(16_000);
    expect(cutMs[0]).toBeLessThan(16_900);
    // Prewarm comes about a second before the minimum window.
    const prewarm = decisions.find((d) => d.kind === "prewarm");
    expect(prewarm && (prewarm.atSample * 1_000) / RATE).toBeCloseTo(
      14_000,
      -2,
    );
  });

  it("ignores pauses before the minimum window", () => {
    const { cutMs } = run([
      ...talk(5_000),
      { ms: 800, kind: "quiet" },
      ...talk(10_500),
      { ms: 500, kind: "quiet" },
      ...talk(3_000),
    ]);
    expect(cutMs).toHaveLength(1);
    expect(cutMs[0]).toBeGreaterThan(16_000);
  });

  it("never cuts on short breaths and falls back to the soft limit", () => {
    const { cuts, cutMs } = run(talk(30_000));
    expect(cuts[0]!.reason).toBe("soft_limit");
    expect(cutMs[0]).toBeGreaterThanOrEqual(25_000);
    expect(cutMs[0]).toBeLessThanOrEqual(27_000);
  });

  it("hard-cuts continuous speech at max plus grace", () => {
    const { cuts, cutMs } = run([{ ms: 30_000, kind: "steady" }]);
    expect(cuts[0]!.reason).toBe("hard_limit");
    expect(cutMs[0]).toBeCloseTo(27_000, -2);
  });

  it("rotates repeatedly through a long talk without gaps", () => {
    const spans: Span[] = [];
    for (let i = 0; i < 6; i++)
      spans.push(...talk(17_000), { ms: 500, kind: "quiet" });
    const { cuts } = run(spans);
    expect(cuts.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < cuts.length; i++) {
      const lengthMs =
        ((cuts[i]!.cutSample - cuts[i - 1]!.cutSample) * 1_000) / RATE;
      expect(lengthMs).toBeGreaterThanOrEqual(15_000);
      expect(lengthMs).toBeLessThanOrEqual(27_000);
    }
  });

  it("prefers a breath-length pause after 20 s over cutting mid-speech", () => {
    const spans: Span[] = [];
    // 2 s phrases with 160 ms breaths: too short for a 300 ms pause cut.
    for (let t = 0; t < 30_000; t += 2_160) {
      spans.push({ ms: 2_000, kind: "speech" }, { ms: 160, kind: "quiet" });
    }
    const { cuts, cutMs } = run(spans);
    expect(cuts[0]!.reason).toBe("short_pause");
    expect(cutMs[0]).toBeGreaterThanOrEqual(20_000);
    expect(cutMs[0]).toBeLessThan(25_000);
  });

  it("does not count a quiet run across an audio gap", () => {
    const planner = new WindowPlanner({
      ...DEFAULT_WINDOW_PLANNER_CONFIG,
      sampleRate: RATE,
    });
    const unit = (start: number, quiet: boolean) => ({
      startSample: start,
      endSample: start + 480,
      dbfs: quiet ? -70 : -15,
      quiet,
    });
    // 16 s of speech, 200 ms quiet, a 1 s gap, 200 ms quiet: two short
    // quiet runs that would only reach the 300 ms pause if joined across it.
    const units = [];
    for (let s = 0; s < 384_000; s += 480) units.push(unit(s, false));
    for (let s = 384_000; s < 388_800; s += 480) units.push(unit(s, true));
    for (let s = 412_800; s < 417_600; s += 480) units.push(unit(s, true));
    const cuts = planner.push(units).filter((d) => d.kind === "cut");
    expect(cuts).toEqual([]);
  });

  it("rejects invalid configs", () => {
    expect(
      () =>
        new WindowPlanner({
          ...DEFAULT_WINDOW_PLANNER_CONFIG,
          sampleRate: RATE,
          minWindowMs: 30_000,
        }),
    ).toThrow(RangeError);
  });
});
