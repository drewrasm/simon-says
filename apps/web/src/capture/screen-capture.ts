import type { FrameUploadMetadata } from "@simon-says/contracts/screen";

export class FrameUploadError extends Error {
  constructor(readonly status: number) {
    super("Frame upload rejected");
    this.name = "FrameUploadError";
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

type Upload = { metadata: FrameUploadMetadata; blob: Blob };
export type ScreenHealth = Readonly<{
  screen: "idle" | "requesting" | "live" | "stopped" | "denied" | "error";
  lastUploadMs: number | null;
  failures: number;
  /** Bounded local heartbeat; updates even when identical bytes skip upload. */
  lastObservation: FrameUploadMetadata | null;
}>;

export function frameDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  )
    throw new RangeError("Invalid screen dimensions");
  const scale = Math.min(1, 1600 / width);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Browsers without WebP support may return PNG or null; both fall back to JPEG. */
export async function encodeScreenFrame(
  canvas: Pick<HTMLCanvasElement, "toBlob">,
): Promise<Blob> {
  const encode = (mimeType: string) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, 0.9),
    );
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (jpeg?.type !== "image/jpeg") throw new Error("Screen encoding failed");
  return jpeg;
}

/** Compare consecutive encoded frames, independently of upload completion. */
export class FrameChanges {
  private previous: string | undefined;
  changed(checksum: string): boolean {
    const changed = checksum !== this.previous;
    this.previous = checksum;
    return changed;
  }
  reset(): void {
    this.previous = undefined;
  }
}

/** Single-flight FIFO: at most three frames including in-flight; three attempts each. */
export class FrameUploadQueue {
  private items: Upload[] = [];
  private running = false;
  private closed = false;
  private controller = new AbortController();
  constructor(
    private readonly send: (item: Upload, signal: AbortSignal) => Promise<void>,
    private readonly success: () => void,
    private readonly failure: () => void,
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}
  enqueue(item: Upload): boolean {
    if (this.closed || this.items.length >= 3) {
      this.failure();
      return false;
    }
    this.items.push(item);
    void this.drain();
    return true;
  }
  close(): void {
    this.closed = true;
    this.controller.abort();
    this.items = [];
  }
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.closed && this.items.length) {
        const item = this.items[0]!;
        for (let attempt = 0; attempt < 3 && !this.closed; attempt++) {
          try {
            await this.send(item, this.controller.signal);
            if (!this.closed) this.success();
            break;
          } catch (error) {
            if (this.closed) break;
            this.failure();
            if (error instanceof FrameUploadError && !error.retryable) break;
            if (attempt < 2) await this.wait(250 * 2 ** attempt);
          }
        }
        this.items.shift();
      }
    } finally {
      this.running = false;
    }
  }
}

/** One instance per audio epoch. Start from a host gesture after microphone start. */
export class ScreenCapture {
  private health: ScreenHealth = {
    screen: "idle",
    lastUploadMs: null,
    failures: 0,
    lastObservation: null,
  };
  private listeners = new Set<() => void>();
  private stream: MediaStream | undefined;
  private video: HTMLVideoElement | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;
  private stopped = false;
  private started = false;
  private seq = 0;
  private changes = new FrameChanges();
  private queue: FrameUploadQueue;
  constructor(
    private readonly options: {
      epoch: number;
      uploadUrl: string;
      getCaptureSampleOffset: () => number | undefined;
    },
  ) {
    this.queue = new FrameUploadQueue(
      async ({ metadata, blob }, signal) => {
        const response = await fetch(options.uploadUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": blob.type,
            "X-Frame-Metadata": JSON.stringify(metadata),
          },
          body: blob,
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new FrameUploadError(response.status);
      },
      () => this.update({ lastUploadMs: Date.now() }),
      () => {
        this.changes.reset();
        this.update({ failures: this.health.failures + 1 });
      },
    );
  }
  getSnapshot = (): ScreenHealth => this.health;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<ScreenHealth>): void {
    this.health = { ...this.health, ...patch };
    for (const listener of this.listeners) listener();
  }
  async start(): Promise<void> {
    if (this.started || this.stopped) return;
    this.started = true;
    this.update({ screen: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      });
      if (this.stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      stream.getVideoTracks().forEach((track) => {
        track.onended = this.stop;
      });
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = stream;
      this.video = video;
      await video.play();
      if (this.stopped) return;
      this.update({ screen: "live" });
      this.timer = setInterval(() => {
        void this.capture();
      }, 1000);
      void this.capture();
    } catch (error) {
      if (this.stopped) return;
      this.stop();
      this.update({
        screen:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "denied"
            : "error",
      });
      throw error;
    }
  }
  private async capture(): Promise<void> {
    if (this.busy || this.stopped || !this.video?.videoWidth) return;
    this.busy = true;
    try {
      // Read immediately before drawing, never at encode/upload completion.
      const captureSampleOffset = this.options.getCaptureSampleOffset();
      if (captureSampleOffset === undefined) {
        this.stop();
        return;
      }
      const dimensions = frameDimensions(
        this.video.videoWidth,
        this.video.videoHeight,
      );
      const canvas = document.createElement("canvas");
      Object.assign(canvas, dimensions);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(this.video, 0, 0, dimensions.width, dimensions.height);
      const encoded = await encodeScreenFrame(canvas);
      if (encoded.type !== "image/webp" && encoded.type !== "image/jpeg")
        throw new Error("Unsupported encoder");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await encoded.arrayBuffer(),
      );
      if (this.stopped) return;
      const checksum = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const metadata: FrameUploadMetadata = {
        ...dimensions,
        epoch: this.options.epoch,
        seq: this.seq++,
        captureSampleOffset,
        mimeType: encoded.type,
        checksum,
        captureState: "live",
      };
      this.update({ lastObservation: metadata });
      if (this.changes.changed(checksum)) {
        if (encoded.size > 1_500_000) {
          this.changes.reset();
          this.update({ failures: this.health.failures + 1 });
        } else this.queue.enqueue({ metadata, blob: encoded });
      }
    } catch {
      this.update({ failures: this.health.failures + 1 });
    } finally {
      this.busy = false;
    }
  }
  stop = (): void => {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    this.queue.close();
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    const last = this.health.lastObservation;
    this.update({
      screen: "stopped",
      lastObservation: last
        ? {
            ...last,
            captureState: "stopped",
            captureSampleOffset:
              this.options.getCaptureSampleOffset() ?? last.captureSampleOffset,
          }
        : null,
    });
  };
}
