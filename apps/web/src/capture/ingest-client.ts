import {
  encodeAudioFrame,
  CAPTION_SAMPLE_RATE,
  type AudioFrame,
} from "@simon-says/contracts/audio-frame";
import { serverIngestMessageSchema } from "@simon-says/contracts/ingest";
import { ResendBuffer, reconnectDelay } from "./frames";

export type ConnectionState =
  "connecting" | "open" | "reconnecting" | "closed" | "rejected";
export type IngestSocket = {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(): void;
  readonly readyState: number;
  readonly bufferedAmount: number;
};

export class IngestClient {
  readonly buffer = new ResendBuffer();
  private socket: IngestSocket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private ready = false;
  private attempt = 0;
  private acked = -1;
  private sentThrough = -1;
  constructor(
    private readonly url: string,
    private readonly epoch: number,
    private readonly changed: (connection: ConnectionState) => void,
    private readonly createSocket: (url: string) => IngestSocket = (url) =>
      new WebSocket(url),
  ) {}
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }
  push(frame: AudioFrame): void {
    if (this.stopped) return;
    this.buffer.add(frame);
    this.flush();
  }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.watchdog);
    this.detach();
    this.changed("closed");
  }
  private detach(): void {
    const socket = this.socket;
    this.socket = undefined;
    this.ready = false;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
  }
  private retry = (): void => {
    if (this.stopped) return;
    clearTimeout(this.watchdog);
    this.detach();
    clearTimeout(this.timer);
    this.changed("reconnecting");
    this.timer = setTimeout(
      () => this.connect(),
      reconnectDelay(this.attempt++),
    );
  };
  private connect(): void {
    if (this.stopped) return;
    this.changed(this.attempt ? "reconnecting" : "connecting");
    try {
      const socket = this.createSocket(this.url);
      this.socket = socket;
      this.watchdog = setTimeout(this.retry, 10_000);
      socket.onopen = () => {
        this.send(
          JSON.stringify({
            type: "hello",
            epoch: this.epoch,
            lastSentSeq: this.buffer.lastSentSeq,
            sampleRate: CAPTION_SAMPLE_RATE,
          }),
        );
      };
      socket.onmessage = (event) => this.message(event.data);
      socket.onclose = socket.onerror = this.retry;
    } catch {
      this.retry();
    }
  }
  private send(data: string | ArrayBuffer): boolean {
    try {
      this.socket!.send(data);
      return true;
    } catch {
      this.retry();
      return false;
    }
  }
  private message(data: unknown): void {
    if (typeof data !== "string") {
      this.retry();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.retry();
      return;
    }
    const result = serverIngestMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.retry();
      return;
    }
    const message = result.data;
    if (message.type === "rejected") {
      if (message.retryable) this.retry();
      else {
        this.stop();
        this.changed("rejected");
      }
      return;
    }
    const through =
      message.type === "ready" ? message.ackedThroughSeq : message.throughSeq;
    // Never trim unsent audio or accept a cursor from another epoch.
    if (
      message.epoch !== this.epoch ||
      through > this.sentThrough ||
      through < this.acked ||
      (message.type === "ack" && !this.ready)
    ) {
      this.retry();
      return;
    }
    this.acked = through;
    this.buffer.acknowledge(through);
    if (message.type === "ready") {
      if (this.ready) {
        this.retry();
        return;
      }
      this.ready = true;
      this.ackedOnSocket = through;
      this.attempt = 0;
      clearTimeout(this.watchdog);
      this.flush();
    }
    if (this.ready) this.changed("open");
  }
  private flush(): void {
    if (!this.ready || !this.socket || this.socket.readyState !== 1) return;
    // Bound the browser's opaque send queue as well as our resend buffer.
    if (this.socket.bufferedAmount > 256_000) {
      this.retry();
      return;
    }
    for (const frame of this.buffer.after(
      Math.max(this.acked, this.ackedOnSocket),
    )) {
      if (!this.send(encodeAudioFrame(frame).slice().buffer)) return;
      this.sentThrough = Math.max(this.sentThrough, frame.seq);
      this.ackedOnSocket = frame.seq;
      if (this.socket && this.socket.bufferedAmount > 256_000) {
        this.retry();
        return;
      }
    }
  }
  private ackedOnSocket = -1;
}
