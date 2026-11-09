/**
 * Binary host audio frames sent over the ingest WebSocket.
 *
 * Layout (little-endian):
 *   0  u8   version (1)
 *   1  u8   kind (1 = PCM16 mono audio)
 *   2  u16  reserved (0)
 *   4  u32  ingest epoch
 *   8  u32  frame sequence number within the epoch
 *  12  u32  sample offset of the first sample on the session source clock
 *  16  ...  PCM16 samples
 *
 * A u32 sample offset covers about 49 hours at 24 kHz.
 */

export const CAPTION_SAMPLE_RATE = 24_000;
export const FRAME_DURATION_MS = 100;
export const FRAME_SAMPLES = (CAPTION_SAMPLE_RATE * FRAME_DURATION_MS) / 1_000;
export const MAX_FRAME_SAMPLES = FRAME_SAMPLES * 2;
export const AUDIO_FRAME_HEADER_BYTES = 16;
export const AUDIO_FRAME_VERSION = 1;
export const AUDIO_FRAME_KIND_PCM16 = 1;
/** Unacknowledged audio the host keeps for resend after a reconnect. */
export const HOST_RESEND_CAPACITY_MS = 120_000;

const U32_MAX = 0xffff_ffff;

export type AudioFrame = {
  epoch: number;
  seq: number;
  sampleOffset: number;
  samples: Int16Array;
};

export type AudioFrameDecodeResult =
  { ok: true; frame: AudioFrame } | { ok: false; reason: AudioFrameError };

export type AudioFrameError =
  | "too_short"
  | "odd_payload"
  | "unsupported_version"
  | "unsupported_kind"
  | "empty_payload"
  | "too_many_samples"
  | "invalid_epoch";

export function sampleOffsetToMs(
  sampleOffset: number,
  sampleRate: number = CAPTION_SAMPLE_RATE,
): number {
  return (sampleOffset * 1_000) / sampleRate;
}

export function msToSampleOffset(
  ms: number,
  sampleRate: number = CAPTION_SAMPLE_RATE,
): number {
  return Math.round((ms * sampleRate) / 1_000);
}

function assertU32(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  }
}

export function encodeAudioFrame(frame: AudioFrame): Uint8Array<ArrayBuffer> {
  assertU32("epoch", frame.epoch);
  assertU32("seq", frame.seq);
  assertU32("sampleOffset", frame.sampleOffset);
  if (frame.epoch === 0) throw new RangeError("epoch must be at least 1");
  if (frame.samples.length === 0 || frame.samples.length > MAX_FRAME_SAMPLES) {
    throw new RangeError(
      `frame must carry 1–${MAX_FRAME_SAMPLES} samples, got ${frame.samples.length}`,
    );
  }

  const bytes = new Uint8Array(
    AUDIO_FRAME_HEADER_BYTES + frame.samples.length * 2,
  );
  const view = new DataView(bytes.buffer);
  view.setUint8(0, AUDIO_FRAME_VERSION);
  view.setUint8(1, AUDIO_FRAME_KIND_PCM16);
  view.setUint16(2, 0, true);
  view.setUint32(4, frame.epoch, true);
  view.setUint32(8, frame.seq, true);
  view.setUint32(12, frame.sampleOffset, true);
  for (let i = 0; i < frame.samples.length; i++) {
    view.setInt16(AUDIO_FRAME_HEADER_BYTES + i * 2, frame.samples[i]!, true);
  }
  return bytes;
}

export function decodeAudioFrame(bytes: Uint8Array): AudioFrameDecodeResult {
  if (bytes.byteLength < AUDIO_FRAME_HEADER_BYTES) {
    return { ok: false, reason: "too_short" };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== AUDIO_FRAME_VERSION) {
    return { ok: false, reason: "unsupported_version" };
  }
  if (view.getUint8(1) !== AUDIO_FRAME_KIND_PCM16) {
    return { ok: false, reason: "unsupported_kind" };
  }
  const payloadBytes = bytes.byteLength - AUDIO_FRAME_HEADER_BYTES;
  if (payloadBytes === 0) return { ok: false, reason: "empty_payload" };
  if (payloadBytes % 2 !== 0) return { ok: false, reason: "odd_payload" };
  const sampleCount = payloadBytes / 2;
  if (sampleCount > MAX_FRAME_SAMPLES) {
    return { ok: false, reason: "too_many_samples" };
  }
  const epoch = view.getUint32(4, true);
  if (epoch === 0) return { ok: false, reason: "invalid_epoch" };

  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = view.getInt16(AUDIO_FRAME_HEADER_BYTES + i * 2, true);
  }
  return {
    ok: true,
    frame: {
      epoch,
      seq: view.getUint32(8, true),
      sampleOffset: view.getUint32(12, true),
      samples,
    },
  };
}
