/**
 * Estimates source-clock ranges for live transcript text.
 *
 * Streaming deltas carry no timestamps. We know how much audio had been sent
 * when each delta arrived, and we measure the typical lag between sending
 * audio and receiving its text, so a delta's text is placed at
 * `sentThroughMs - lagMs`. The final text replaces the deltas and is split
 * into sentences, each mapped back onto the delta timeline by its relative
 * character position.
 */

export type TimedDelta = {
  text: string;
  /** Source-clock end of all audio sent to the window when the delta arrived. */
  sentThroughMs: number;
};

export type WindowRange = { startMs: number; endMs: number };

export type TimedSentence = {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
  uncertaintyMs: number;
};

export type TimingOptions = {
  /** Typical delay from sending audio to receiving its text. */
  lagMs: number;
  /** Floor for reported uncertainty. */
  minUncertaintyMs?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Estimated source time reached by the text received so far. */
export function estimateInterimEndMs(
  window: WindowRange,
  sentThroughMs: number,
  lagMs: number,
): number {
  return clamp(sentThroughMs - lagMs, window.startMs, window.endMs);
}

/** Splits on sentence punctuation followed by whitespace; keeps punctuation. */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Maps a fraction of the window's text (0–1) to an estimated source time,
 * using delta arrival as anchors. Falls back to linear placement across the
 * window when there are no deltas.
 */
function timeAtFraction(
  fraction: number,
  window: WindowRange,
  deltas: readonly TimedDelta[],
  lagMs: number,
): number {
  const totalChars = deltas.reduce((sum, delta) => sum + delta.text.length, 0);
  if (totalChars === 0) {
    return window.startMs + fraction * (window.endMs - window.startMs);
  }
  const target = fraction * totalChars;
  let chars = 0;
  let previousTime = window.startMs;
  for (const delta of deltas) {
    const deltaTime = estimateInterimEndMs(window, delta.sentThroughMs, lagMs);
    const next = chars + delta.text.length;
    if (target <= next) {
      // Interpolate inside the delta between the previous anchor and this one.
      const within =
        delta.text.length === 0 ? 1 : (target - chars) / delta.text.length;
      return previousTime + within * Math.max(0, deltaTime - previousTime);
    }
    chars = next;
    previousTime = Math.max(previousTime, deltaTime);
  }
  return previousTime;
}

/**
 * Splits a window's final text into sentences with estimated ranges.
 * Ranges are contiguous, monotonic, inside the window, and the last sentence
 * ends at the window end.
 */
export function timeSentences(
  finalText: string,
  window: WindowRange,
  deltas: readonly TimedDelta[],
  options: TimingOptions,
): TimedSentence[] {
  const sentences = splitSentences(finalText);
  if (sentences.length === 0) return [];
  const windowMs = window.endMs - window.startMs;
  const hasAnchors = deltas.some((delta) => delta.text.length > 0);
  const uncertaintyMs = hasAnchors
    ? Math.max(options.minUncertaintyMs ?? 500, options.lagMs)
    : windowMs / 2;

  const totalChars = sentences.reduce(
    (sum, sentence) => sum + sentence.length,
    0,
  );
  const result: TimedSentence[] = [];
  let chars = 0;
  let startMs = window.startMs;
  sentences.forEach((text, index) => {
    chars += text.length;
    const isLast = index === sentences.length - 1;
    const rawEnd = isLast
      ? window.endMs
      : timeAtFraction(chars / totalChars, window, deltas, options.lagMs);
    const endMs = clamp(rawEnd, startMs, window.endMs);
    result.push({ index, text, startMs, endMs, uncertaintyMs });
    startMs = endMs;
  });
  return result;
}
