import "server-only";
import type { TranscriptionModel } from "ai";
import {
  CAPTION_SAMPLE_RATE,
  sampleOffsetToMs,
  type AudioFrame,
} from "@simon-says/contracts/audio-frame";
import { QuietDetector } from "@simon-says/domain/audio-level";
import {
  WindowPlanner,
  DEFAULT_WINDOW_PLANNER_CONFIG,
  type WindowPlannerConfig,
  type CutReason,
} from "@simon-says/domain/caption-windows";
import type { TimedDelta } from "@simon-says/domain/caption-timing";
import { CaptionAssembler } from "./assembler";
import { EventHub } from "./event-hub";
import { openProviderWindow, type CaptionDelay } from "./openai-window";
import { RingBuffer } from "./ring-buffer";
import type { CaptionTelemetry } from "./telemetry";

type Window = {
  index: number;
  id: string;
  startSample: number;
  endSample: number;
  closed: boolean;
  wake: (() => void) | undefined;
  task: Promise<void>;
  abort: AbortController;
  cancelled: boolean;
  cutAt: number | undefined;
  cutReason: CutReason | "stop";
  retries: number;
  outcome: "success" | "error" | "cancelled";
  telemetryEnded: boolean;
};

export class WindowManager {
  readonly ring = new RingBuffer();
  private readonly detector = new QuietDetector({
    sampleRate: CAPTION_SAMPLE_RATE,
  });
  private readonly planner: WindowPlanner;
  private readonly windows = new Set<Window>();
  private active: Window | undefined;
  private prewarmed: Window | undefined;
  private nextWindow = 0;
  private nextSample = 0;
  private nextSeq = 0;
  private lagMs = 800;
  private stopped = false;
  private finishing: Promise<void> | undefined;

  constructor(
    private readonly options: {
      model: TranscriptionModel;
      assembler: CaptionAssembler;
      hub: EventHub;
      epoch: number;
      delay?: CaptionDelay;
      telemetry?: CaptionTelemetry;
      planner?: WindowPlannerConfig;
      timeoutMs?: number;
    },
  ) {
    this.planner = new WindowPlanner(
      options.planner ?? {
        ...DEFAULT_WINDOW_PLANNER_CONFIG,
        sampleRate: CAPTION_SAMPLE_RATE,
      },
    );
  }

  get ackedThroughSeq() {
    return this.nextSeq - 1;
  }
  get sourceMs() {
    return sampleOffsetToMs(this.nextSample);
  }

  push(
    frame: AudioFrame,
  ):
    | "accepted"
    | "duplicate"
    | "sequence_conflict"
    | "invalid_frame"
    | "overloaded" {
    if (this.stopped) return "overloaded";
    if (this.windows.size + this.options.assembler.backlog >= 8) {
      this.options.hub.publish({
        kind: "capture.state",
        session: "degraded",
        audio: "receiving",
        captionLagMs: this.lagMs,
        reason: "backlog_limit",
      });
      return "overloaded";
    }
    if (frame.epoch !== this.options.epoch) return "invalid_frame";
    // Old duplicates must still match retained bytes. Evicted sequences are refused.
    if (frame.seq < this.nextSeq) {
      if (!this.ring.hasSequence(frame.seq)) return "invalid_frame";
      return this.ring.add(frame) === "duplicate"
        ? "duplicate"
        : "sequence_conflict";
    }
    if (this.nextSeq === 0 && frame.seq === 0) {
      this.nextSample = frame.sampleOffset;
      this.planner.reset(frame.sampleOffset);
    }
    if (frame.seq !== this.nextSeq || frame.sampleOffset !== this.nextSample)
      return "invalid_frame";
    const added = this.ring.add(frame);
    if (added === "sequence_conflict") return added;
    this.active ??= this.create(frame.sampleOffset);
    const decisions = this.planner.push(
      this.detector.push(frame.sampleOffset, frame.samples),
    );
    for (const decision of decisions) {
      if (decision.kind === "prewarm") {
        this.prewarmed ??= this.create(decision.atSample);
      } else {
        this.options.telemetry?.(`window_cut_${decision.reason}`, 1);
        this.active.cutReason = decision.reason;
        this.active.endSample = decision.cutSample;
        this.active.closed = true;
        this.active.wake?.();
        this.options.telemetry?.(
          "window_duration_ms",
          sampleOffsetToMs(this.active.endSample - this.active.startSample),
        );
        this.active = this.prewarmed ?? this.create(decision.cutSample);
        this.active.startSample = decision.cutSample;
        this.prewarmed = undefined;
        this.active.cutAt = performance.now();
      }
    }
    this.nextSample += frame.samples.length;
    this.nextSeq++;
    this.active.endSample = this.nextSample;
    this.active.wake?.();
    return "accepted";
  }

  private create(startSample: number): Window {
    const index = this.nextWindow++;
    const window: Window = {
      index,
      id: `${this.options.epoch}-${index}`,
      startSample,
      endSample: startSample,
      closed: false,
      wake: undefined,
      task: Promise.resolve(),
      abort: new AbortController(),
      cancelled: false,
      cutAt: undefined,
      cutReason: "stop",
      retries: 0,
      outcome: "cancelled",
      telemetryEnded: false,
    };
    this.windows.add(window);
    this.options.telemetry?.("window_start", 1, {
      session_id: this.options.hub.sessionId,
      window_id: window.id,
    });
    this.options.telemetry?.(
      "backlog",
      this.windows.size + this.options.assembler.backlog,
    );
    window.task = this.run(window).finally(() => {
      this.endTelemetry(window);
      this.windows.delete(window);
      this.options.telemetry?.(
        "backlog",
        this.windows.size + this.options.assembler.backlog,
      );
    });
    return window;
  }

  /** Finish even if a provider ignores abort; late settlement cannot double count. */
  private endTelemetry(window: Window) {
    if (window.telemetryEnded) return;
    window.telemetryEnded = true;
    this.options.telemetry?.("window_end", 1, {
      session_id: this.options.hub.sessionId,
      window_id: window.id,
      duration_ms: sampleOffsetToMs(window.endSample - window.startSample),
      cut_reason: window.cutReason,
      retry_count: window.retries,
      outcome: window.outcome,
    });
  }

  private async run(window: Window) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (window.cancelled) return;
      const abort = new AbortController();
      window.abort = abort;
      const timeout = setTimeout(
        () => abort.abort(),
        this.options.timeoutMs ?? 45000,
      );
      let readSample: number | undefined;
      let sentThroughMs = sampleOffsetToMs(window.startSample);
      let sentAt = performance.now();
      let text = "";
      let final: string | undefined;
      const deltas: TimedDelta[] = [];
      const audio = new ReadableStream<Uint8Array>(
        {
          pull: async (controller) => {
            while (!window.cancelled && !abort.signal.aborted) {
              readSample ??= window.startSample;
              // A prewarmed stream must not take ownership of samples before the cut.
              if (
                window === this.prewarmed ||
                (window !== this.active && !window.closed)
              ) {
                readSample = undefined;
              } else if (readSample < window.endSample) {
                const until = Math.min(readSample + 4800, window.endSample);
                const chunks = this.ring.replay(readSample, until);
                if (!chunks) {
                  controller.error(new Error("replay_unavailable"));
                  return;
                }
                const bytes = new Uint8Array((until - readSample) * 2);
                const view = new DataView(bytes.buffer);
                let offset = 0;
                for (const chunk of chunks)
                  for (const sample of chunk) {
                    view.setInt16(offset, sample, true);
                    offset += 2;
                  }
                if (window.cutAt !== undefined) {
                  this.options.telemetry?.(
                    "rotation_gap_ms",
                    performance.now() - window.cutAt,
                  );
                  window.cutAt = undefined;
                }
                readSample = until;
                sentThroughMs = sampleOffsetToMs(until);
                sentAt = performance.now();
                controller.enqueue(bytes);
                return;
              } else if (window.closed) {
                controller.close();
                return;
              }
              let wake: (() => void) | undefined;
              await new Promise<void>((resolve) => {
                wake = resolve;
                window.wake = resolve;
              });
              if (window.wake === wake) window.wake = undefined;
            }
            controller.error(new Error("window_cancelled"));
          },
        },
        { highWaterMark: 0 },
      );
      const onAbort = () => window.wake?.();
      abort.signal.addEventListener("abort", onAbort, { once: true });
      try {
        for await (const part of openProviderWindow(
          this.options.model,
          audio,
          abort.signal,
          this.options.delay,
        )) {
          if (window.cancelled) return;
          if (part.type === "error") throw new Error("provider_failed");
          if (part.type === "transcript-delta") {
            text += part.delta;
            if (text.length > 10000) throw new Error("transcript_limit");
            // Delta timestamps are unavailable. Arrival since the latest audio pull is an observable lag proxy.
            this.lagMs =
              this.lagMs * 0.8 + Math.max(0, performance.now() - sentAt) * 0.2;
            this.options.telemetry?.("lag_ms", this.lagMs, {
              phase: "interim",
            });
            deltas.push({ text: part.delta, sentThroughMs });
            this.options.assembler.interim(
              window.id,
              {
                startMs: sampleOffsetToMs(window.startSample),
                endMs: sampleOffsetToMs(window.endSample),
              },
              text,
              sentThroughMs,
              this.lagMs,
            );
          }
          if (part.type === "transcript-final") {
            if (!window.closed || readSample !== window.endSample)
              throw new Error("premature_final");
            final = part.text;
          }
        }
        if (final === undefined) throw new Error("missing_final");
        await this.options.assembler.complete({
          index: window.index,
          windowId: window.id,
          range: {
            startMs: sampleOffsetToMs(window.startSample),
            endMs: sampleOffsetToMs(window.endSample),
          },
          text: final,
          deltas,
          lagMs: this.lagMs,
        });
        window.outcome = "success";
        this.options.telemetry?.(
          "lag_ms",
          Math.max(0, performance.now() - sentAt),
          { phase: "final" },
        );
        return;
      } catch {
        abort.abort();
        if (window.cancelled) return;
        this.options.telemetry?.("errors", 1, {
          error_code: "transcription_failed",
        });
        if (attempt < 2) {
          window.retries++;
          this.options.telemetry?.("retries", 1);
          continue;
        }
        window.outcome = "error";
        this.options.hub.publish({
          kind: "capture.state",
          session: "degraded",
          audio: "receiving",
          captionLagMs: this.lagMs,
          reason: "transcription_failed",
        });
        // Wait for the source range to be fixed before reporting its exact gap.
        while (!window.closed && !window.cancelled)
          await new Promise<void>((resolve) => {
            window.wake = resolve;
          });
        if (!window.cancelled)
          await this.options.assembler.complete({
            index: window.index,
            windowId: window.id,
            range: {
              startMs: sampleOffsetToMs(window.startSample),
              endMs: sampleOffsetToMs(window.endSample),
            },
            text: "",
            deltas: [],
            lagMs: this.lagMs,
            failed: true,
          });
      } finally {
        clearTimeout(timeout);
        abort.abort();
        abort.signal.removeEventListener("abort", onAbort);
      }
    }
  }

  finish(timeoutMs = 5000): Promise<void> {
    return (this.finishing ??= this.finishWithin(timeoutMs));
  }

  private async finishWithin(timeoutMs: number): Promise<void> {
    let expire!: () => void;
    const expired = new Promise<void>((resolve) => {
      expire = resolve;
    });
    const deadline = setTimeout(() => {
      // Fence stalled provider/sink work before reporting every unresolved source range.
      this.options.assembler.cancel();
      for (const window of this.windows) {
        if (!window.cancelled && window.endSample > window.startSample) {
          this.options.telemetry?.("gaps", 1);
          this.options.hub.publish({
            kind: "caption.gap",
            epoch: this.options.epoch,
            startMs: sampleOffsetToMs(window.startSample),
            endMs: sampleOffsetToMs(window.endSample),
            reason: "transcription_failed",
          });
        }
      }
      this.cancel();
      expire();
    }, timeoutMs);

    this.stopped = true;
    if (this.prewarmed) {
      this.prewarmed.cancelled = true;
      this.prewarmed.abort.abort();
      this.prewarmed.wake?.();
    }
    if (this.active) {
      if (this.active.endSample === this.active.startSample) {
        this.active.cancelled = true;
        this.active.abort.abort();
      }
      this.active.closed = true;
      this.active.wake?.();
    }
    await Promise.race([
      Promise.all([...this.windows].map((window) => window.task)),
      expired,
    ]);
    clearTimeout(deadline);
  }

  /** Epoch fencing/shutdown suppresses all late provider output. */
  cancel() {
    this.stopped = true;
    this.options.assembler.cancel();
    this.options.telemetry?.("backlog", 0);
    for (const window of this.windows) {
      window.cancelled = true;
      this.endTelemetry(window);
      window.abort.abort();
      window.wake?.();
    }
  }
}
