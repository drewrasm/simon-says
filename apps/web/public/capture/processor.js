/* global AudioWorkletProcessor, registerProcessor, sampleRate, currentTime */
import { PcmFramer } from "./pcm.js";

class HostPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { outputRate, frameSamples } = options.processorOptions;
    this.framer = new PcmFramer(
      sampleRate,
      outputRate,
      frameSamples,
      (samples, level) => {
        this.port.postMessage({ samples, level }, [samples.buffer]);
      },
    );
  }
  process(inputs) {
    const mono = inputs[0]?.[0];
    if (mono) {
      if (!this.clockStarted) {
        this.clockStarted = true;
        this.port.postMessage({ clockStartTime: currentTime });
      }
      this.framer.push(mono);
    }
    return true;
  }
}
registerProcessor("host-pcm", HostPcmProcessor);
