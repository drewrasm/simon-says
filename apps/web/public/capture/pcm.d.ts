export function floatToPcm16(value: number): number;
export class PcmFramer {
  constructor(
    inputRate: number,
    outputRate: number,
    frameSamples: number,
    emit: (samples: Int16Array, level: number) => void,
  );
  push(input: Float32Array): void;
}
