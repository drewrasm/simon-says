/** Synthetic PCM16 for domain tests: tones stand in for speech. */

/** `speech` rises and falls like syllables; `steady` is a constant tone. */
export type Span = { ms: number; kind: "speech" | "steady" | "quiet" };

export function synthesize(
  spans: readonly Span[],
  sampleRate: number,
): Int16Array {
  const total = spans.reduce(
    (sum, span) => sum + Math.round((span.ms * sampleRate) / 1_000),
    0,
  );
  const out = new Int16Array(total);
  let offset = 0;
  let seed = 7;
  for (const span of spans) {
    const count = Math.round((span.ms * sampleRate) / 1_000);
    for (let i = 0; i < count; i++) {
      const t = (offset + i) / sampleRate;
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      const noise = (seed / 2_147_483_648 - 0.5) * 0.002;
      const tone = 0.3 * Math.sin(2 * Math.PI * 180 * t);
      const envelope = 0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t);
      const speech =
        span.kind === "speech"
          ? tone * envelope
          : span.kind === "steady"
            ? tone
            : 0;
      out[offset + i] = Math.round((speech + noise) * 32_767);
    }
    offset += count;
  }
  return out;
}

/** Splits audio into 100 ms frames tagged with their source sample offset. */
export function* frames(samples: Int16Array, frameSamples: number) {
  for (let offset = 0; offset < samples.length; offset += frameSamples) {
    yield {
      sampleOffset: offset,
      samples: samples.subarray(offset, offset + frameSamples),
    };
  }
}
