import {
  ScreenCapture,
  type ScreenHealth,
} from "../../../capture/screen-capture";

type ScreenSource = {
  epoch: number;
  getCaptureSampleOffset: () => number | undefined;
};

const IDLE: ScreenHealth = {
  screen: "idle",
  lastUploadMs: null,
  failures: 0,
  lastErrorStatus: null,
  uploadFailed: false,
  lastObservation: null,
};

/** Owns screen resources and preserves frame sequence numbers across re-sharing. */
export class ScreenShare {
  private capture: ScreenCapture | null = null;
  private unsubscribe: (() => void) | null = null;
  private epoch: number | null = null;
  private nextSequence = 0;
  private health = IDLE;
  private listeners = new Set<() => void>();

  constructor(private readonly sessionId: string) {}

  getSnapshot = () => this.health;
  getServerSnapshot = () => IDLE;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Invoked synchronously by the button, preserving display-media user activation. */
  start = async (source: ScreenSource | null) => {
    if (
      !source ||
      this.health.screen === "live" ||
      this.health.screen === "requesting"
    )
      return;
    this.unsubscribe?.();
    if (this.epoch !== source.epoch) {
      this.epoch = source.epoch;
      this.nextSequence = 0;
    }
    const instance = new ScreenCapture({
      ...source,
      initialSequence: this.nextSequence,
      uploadUrl: `/api/sessions/${encodeURIComponent(this.sessionId)}/frames`,
    });
    this.capture = instance;
    this.unsubscribe = instance.subscribe(() => {
      this.health = instance.getSnapshot();
      const observation = this.health.lastObservation;
      if (observation) this.nextSequence = observation.seq + 1;
      for (const listener of this.listeners) listener();
    });
    try {
      await instance.start();
    } catch {
      // ScreenCapture publishes denied/error after releasing its resources.
    }
  };

  stop = () => {
    this.capture?.stop();
  };
}

export function screenShareError(health: ScreenHealth): string | null {
  if (health.screen === "denied")
    return "Screen access was blocked. Choose Share screen to try again and allow access in your browser.";
  if (health.screen === "error")
    return "Screen sharing couldn't start. Check your browser's screen capture permissions and try again.";
  if (health.lastErrorStatus === 403)
    return "Screen uploads were refused (403). Reload the host page and check your access.";
  if (health.lastErrorStatus === 409)
    return "Screen uploads conflict with the current capture (409). Stop captions and go live again.";
  if (health.lastErrorStatus === 503)
    return "Screen uploads are unavailable (503). Frames may be missing while uploads retry.";
  if (health.uploadFailed)
    return "Some screen frames couldn't be uploaded. Frames may be missing; uploads will retry.";
  return null;
}
