import { describe, expect, it } from "vitest";
import {
  estimateInterimEndMs,
  splitSentences,
  timeSentences,
} from "./caption-timing";

const window = { startMs: 10_000, endMs: 30_000 };

describe("splitSentences", () => {
  it("splits on sentence punctuation and keeps it", () => {
    expect(splitSentences(" Welcome. Run kubectl apply! Ready? ")).toEqual([
      "Welcome.",
      "Run kubectl apply!",
      "Ready?",
    ]);
    expect(splitSentences("version 1.5 ships")).toEqual(["version 1.5 ships"]);
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("estimateInterimEndMs", () => {
  it("subtracts lag and stays inside the window", () => {
    expect(estimateInterimEndMs(window, 15_000, 800)).toBe(14_200);
    expect(estimateInterimEndMs(window, 10_300, 800)).toBe(10_000);
    expect(estimateInterimEndMs(window, 40_000, 800)).toBe(30_000);
  });
});

describe("timeSentences", () => {
  it("places sentences on the delta timeline", () => {
    // Text arrives roughly evenly: 10 chars per 2 s of audio, 1 s lag.
    const deltas = Array.from({ length: 10 }, (_, i) => ({
      text: "abcdefghij",
      sentThroughMs: 10_000 + (i + 1) * 2_000 + 1_000,
    }));
    const finalText = `${"a".repeat(49)}. ${"b".repeat(49)}.`;
    const sentences = timeSentences(finalText, window, deltas, {
      lagMs: 1_000,
    });
    expect(sentences).toHaveLength(2);
    expect(sentences[0]!.startMs).toBe(10_000);
    // Halfway through the text is about halfway through the window.
    expect(sentences[0]!.endMs).toBeGreaterThan(19_000);
    expect(sentences[0]!.endMs).toBeLessThan(21_000);
    expect(sentences[1]!.startMs).toBe(sentences[0]!.endMs);
    expect(sentences[1]!.endMs).toBe(30_000);
    expect(sentences[0]!.uncertaintyMs).toBe(1_000);
  });

  it("follows bursty delivery instead of spreading text evenly", () => {
    // All text for the first sentence arrives early; the rest arrives late.
    const deltas = [
      { text: "x".repeat(20), sentThroughMs: 13_000 },
      { text: "y".repeat(20), sentThroughMs: 29_000 },
    ];
    const finalText = `${"x".repeat(19)}. ${"y".repeat(19)}.`;
    const [first] = timeSentences(finalText, window, deltas, { lagMs: 500 });
    expect(first!.endMs).toBeLessThan(13_000);
  });

  it("falls back to linear placement with wide uncertainty without deltas", () => {
    const sentences = timeSentences("One. Two. Three.", window, [], {
      lagMs: 800,
    });
    expect(sentences.map((s) => s.text)).toEqual(["One.", "Two.", "Three."]);
    expect(sentences[2]!.endMs).toBe(30_000);
    expect(sentences[0]!.uncertaintyMs).toBe(10_000);
  });

  it("keeps ranges monotonic and inside the window", () => {
    const deltas = [
      { text: "late", sentThroughMs: 60_000 },
      { text: "early", sentThroughMs: 9_000 },
    ];
    const sentences = timeSentences("A b c. D e f. G h i.", window, deltas, {
      lagMs: 0,
    });
    for (const sentence of sentences) {
      expect(sentence.startMs).toBeGreaterThanOrEqual(window.startMs);
      expect(sentence.endMs).toBeLessThanOrEqual(window.endMs);
      expect(sentence.endMs).toBeGreaterThanOrEqual(sentence.startMs);
    }
  });

  it("returns nothing for empty finals", () => {
    expect(timeSentences("  ", window, [], { lagMs: 0 })).toEqual([]);
  });
});
