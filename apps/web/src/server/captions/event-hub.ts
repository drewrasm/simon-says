import "server-only";
import {
  captionEventSchema,
  type CaptionEvent,
} from "@simon-says/contracts/caption";

type WithoutEnvelope<T> = T extends unknown
  ? Omit<T, "cursor" | "sessionId">
  : never;
export type CaptionPayload = WithoutEnvelope<CaptionEvent>;

/** Single replica only. Replace with the shared durable event source in docs/architecture.md before multiple replicas. */
export class EventHub {
  private cursor = 0;
  private log: CaptionEvent[] = [];
  private finals: CaptionEvent[] = [];
  private state: CaptionPayload = {
    kind: "capture.state",
    session: "setup",
    audio: "stopped",
    captionLagMs: null,
  };
  private readonly listeners = new Set<(event: CaptionEvent) => void>();
  constructor(
    readonly sessionId: string,
    private readonly capacity = 500,
  ) {}

  private stamp(payload: CaptionPayload): CaptionEvent {
    return captionEventSchema.parse({
      ...payload,
      sessionId: this.sessionId,
      cursor: String(++this.cursor).padStart(16, "0"),
    });
  }

  publish(payload: CaptionPayload): CaptionEvent {
    const event = this.stamp(payload);
    this.log.push(event);
    if (this.log.length > this.capacity) this.log.shift();
    if (event.kind === "caption.final") {
      this.finals.push(event);
      if (this.finals.length > this.capacity) this.finals.shift();
    }
    if (event.kind === "capture.state") this.state = payload;
    for (const listener of this.listeners) listener(event);
    return event;
  }

  subscribe(
    listener: (event: CaptionEvent) => void,
    lastEventId?: string,
  ): () => void {
    const cursor = lastEventId === undefined ? NaN : Number(lastEventId);
    const oldest = Number(this.log[0]?.cursor ?? this.cursor + 1);
    const replayable =
      Number.isSafeInteger(cursor) &&
      cursor >= oldest - 1 &&
      cursor <= this.cursor;
    if (replayable) {
      for (const event of this.log)
        if (Number(event.cursor) > cursor) listener(event);
    } else {
      listener(this.stamp(this.state));
      for (const event of this.finals) listener(this.stamp(event));
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
