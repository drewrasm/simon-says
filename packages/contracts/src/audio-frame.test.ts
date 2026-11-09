import { describe, expect, it } from "vitest";
import {
  AUDIO_FRAME_HEADER_BYTES,
  FRAME_SAMPLES,
  MAX_FRAME_SAMPLES,
  decodeAudioFrame,
  encodeAudioFrame,
  msToSampleOffset,
  sampleOffsetToMs,
} from "./audio-frame";

function frame(samples = new Int16Array([0, 1, -1, 32767, -32768])) {
  return { epoch: 3, seq: 41, sampleOffset: 98_400, samples };
}

describe("audio frames", () => {
  it("round-trips header and samples", () => {
    const decoded = decodeAudioFrame(encodeAudioFrame(frame()));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.frame.epoch).toBe(3);
    expect(decoded.frame.seq).toBe(41);
    expect(decoded.frame.sampleOffset).toBe(98_400);
    expect(Array.from(decoded.frame.samples)).toEqual([
      0, 1, -1, 32767, -32768,
    ]);
  });

  it("decodes a view into a larger buffer", () => {
    const bytes = encodeAudioFrame(frame());
    const padded = new Uint8Array(bytes.byteLength + 8);
    padded.set(bytes, 4);
    const decoded = decodeAudioFrame(padded.subarray(4, 4 + bytes.byteLength));
    expect(decoded.ok).toBe(true);
  });

  it("uses 100 ms frames at 24 kHz", () => {
    expect(FRAME_SAMPLES).toBe(2_400);
    expect(
      encodeAudioFrame(frame(new Int16Array(FRAME_SAMPLES))).byteLength,
    ).toBe(AUDIO_FRAME_HEADER_BYTES + 4_800);
  });

  it.each([
    ["too_short", new Uint8Array(8)],
    ["empty_payload", encodeAudioFrame(frame()).subarray(0, 16)],
    ["odd_payload", encodeAudioFrame(frame()).subarray(0, 17)],
  ] as const)("rejects %s", (reason, bytes) => {
    expect(decodeAudioFrame(bytes)).toEqual({ ok: false, reason });
  });

  it("rejects unknown versions and zero epochs", () => {
    const bytes = encodeAudioFrame(frame());
    const badVersion = bytes.slice();
    badVersion[0] = 9;
    expect(decodeAudioFrame(badVersion)).toEqual({
      ok: false,
      reason: "unsupported_version",
    });
    const zeroEpoch = bytes.slice();
    zeroEpoch.fill(0, 4, 8);
    expect(decodeAudioFrame(zeroEpoch)).toEqual({
      ok: false,
      reason: "invalid_epoch",
    });
  });

  it("refuses to encode oversized or invalid frames", () => {
    expect(() =>
      encodeAudioFrame(frame(new Int16Array(MAX_FRAME_SAMPLES + 1))),
    ).toThrow(RangeError);
    expect(() => encodeAudioFrame({ ...frame(), seq: -1 })).toThrow(
      RangeError,
    );
    expect(() => encodeAudioFrame({ ...frame(), epoch: 0 })).toThrow(
      RangeError,
    );
  });

  it("converts between samples and source-clock ms", () => {
    expect(sampleOffsetToMs(24_000)).toBe(1_000);
    expect(msToSampleOffset(1_500)).toBe(36_000);
  });
});
