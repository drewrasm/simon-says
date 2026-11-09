/** Clamp finite Float32 audio into signed PCM16. */
export function floatToPcm16(value) {
  const sample = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return Math.round(sample * (sample < 0 ? 32768 : 32767));
}

/** Streaming linear resampler. Carries interpolation phase across render quanta. */
export class PcmFramer {
  constructor(inputRate, outputRate, frameSamples, emit) {
    this.step = inputRate / outputRate;
    this.frameSamples = frameSamples;
    this.emit = emit;
    this.position = 0;
    this.inputIndex = 0;
    this.previous = 0;
    this.frame = new Int16Array(frameSamples);
    this.used = 0;
    this.energy = 0;
  }

  push(input) {
    for (const raw of input) {
      const current = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
      while (this.position <= this.inputIndex) {
        const fraction = this.position - (this.inputIndex - 1);
        const sample =
          this.inputIndex === 0
            ? current
            : this.previous + (current - this.previous) * fraction;
        this.frame[this.used++] = floatToPcm16(sample);
        this.energy += sample * sample;
        if (this.used === this.frameSamples) {
          this.emit(
            this.frame,
            Math.min(1, Math.sqrt(this.energy / this.frameSamples)),
          );
          this.frame = new Int16Array(this.frameSamples);
          this.used = 0;
          this.energy = 0;
        }
        this.position += this.step;
      }
      this.previous = current;
      this.inputIndex++;
    }
  }
}
