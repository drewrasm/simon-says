import {
  CAPTION_SAMPLE_RATE,
  FRAME_SAMPLES,
} from "@simon-says/contracts/audio-frame";
import { FrameSequencer, type LocalGap } from "./frames";
import { IngestClient, type ConnectionState } from "./ingest-client";

export type CaptureHealth = Readonly<{
  mic: "idle" | "requesting" | "live" | "denied" | "error";
  connection: ConnectionState;
  level: number;
  unackedMs: number;
  localGaps: readonly LocalGap[];
}>;
export type HostCaptureOptions = {
  epoch: number;
  ingestUrl: string;
  deviceId?: string;
};

export function microphoneConstraints(
  deviceId?: string,
): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  };
}

/** One instance per epoch; stop is terminal. Call start from an explicit host gesture. */
export class HostCapture {
  private health: CaptureHealth = {
    mic: "idle",
    connection: "closed",
    level: 0,
    unackedMs: 0,
    localGaps: [],
  };
  private listeners = new Set<() => void>();
  private stream: MediaStream | undefined;
  private context: AudioContext | undefined;
  private node: AudioWorkletNode | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private client: IngestClient;
  private sequencer: FrameSequencer;
  private started = false;
  private stopped = false;
  private closing: Promise<void> = Promise.resolve();
  constructor(private readonly options: HostCaptureOptions) {
    this.sequencer = new FrameSequencer(options.epoch);
    this.client = new IngestClient(
      options.ingestUrl,
      options.epoch,
      (connection) => {
        this.update({ connection });
        if (connection === "rejected") void this.stopResources();
      },
    );
  }
  getSnapshot = (): CaptureHealth => this.health;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<CaptureHealth>): void {
    this.health = {
      ...this.health,
      unackedMs: this.client.buffer.unackedMs,
      localGaps: this.client.buffer.localGaps,
      ...patch,
    };
    for (const listener of this.listeners) listener();
  }
  async start(): Promise<void> {
    if (this.started || this.stopped) return;
    this.started = true;
    this.update({ mic: "requesting" });
    try {
      // Resume in the gesture's synchronous turn, before the permission prompt.
      let context: AudioContext;
      try {
        context = new AudioContext({ sampleRate: CAPTION_SAMPLE_RATE });
      } catch (error) {
        if (
          !(error instanceof DOMException) ||
          error.name !== "NotSupportedError"
        )
          throw error;
        context = new AudioContext();
      }
      this.context = context;
      const resumed = context.resume();
      // Handle resume rejection even when getUserMedia rejects first.
      void resumed.catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia(
        microphoneConstraints(this.options.deviceId),
      );
      if (this.stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      for (const track of stream.getAudioTracks())
        track.onended = () => {
          void this.fail();
        };
      await resumed;
      await context.audioWorklet.addModule("/capture/processor.js");
      if (this.stopped) return;
      this.node = new AudioWorkletNode(context, "host-pcm", {
        processorOptions: {
          outputRate: CAPTION_SAMPLE_RATE,
          frameSamples: FRAME_SAMPLES,
        },
        outputChannelCount: [1],
      });
      this.node.onprocessorerror = () => {
        void this.fail();
      };
      this.node.port.onmessage = (event: MessageEvent<unknown>) => {
        if (this.stopped) return;
        const data = event.data;
        if (
          typeof data !== "object" ||
          data === null ||
          !("samples" in data) ||
          !(data.samples instanceof Int16Array) ||
          data.samples.length !== FRAME_SAMPLES ||
          !("level" in data) ||
          typeof data.level !== "number" ||
          !Number.isFinite(data.level)
        ) {
          void this.fail();
          return;
        }
        try {
          this.client.push(this.sequencer.next(data.samples));
          this.update({ level: Math.max(0, Math.min(1, data.level)) });
        } catch {
          void this.fail();
        }
      };
      this.client.start();
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(this.node);
      // Worklet emits silence; connecting keeps it scheduled without mic playback.
      this.node.connect(context.destination);
      this.update({ mic: "live" });
    } catch (error) {
      if (this.stopped) return;
      await this.fail(
        error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "SecurityError")
          ? "denied"
          : "error",
      );
      throw error;
    }
  }
  private async fail(mic: "denied" | "error" = "error"): Promise<void> {
    await this.stop();
    this.update({ mic });
  }
  stop = (): Promise<void> => {
    this.client.stop();
    return this.stopResources();
  };
  private stopResources(): Promise<void> {
    this.stopped = true;
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.onprocessorerror = null;
      this.node.port.close();
      this.node.disconnect();
    }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.node = undefined;
    this.source = undefined;
    this.stream = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== "closed") {
      this.closing = context.close().catch(() => {
        this.update({ mic: "error" });
      });
    }
    this.update({ mic: "idle", level: 0 });
    return this.closing;
  }
}
