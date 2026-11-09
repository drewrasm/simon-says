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
  private state: CaptionEvent;
  private readonly listeners = new Set<
    (events: readonly CaptionEvent[]) => void
  >();
  constructor(
    readonly sessionId: string,
    private readonly capacity = 500,
  ) {
    this.state = this.stamp({
      kind: "capture.state",
      session: "setup",
      audio: "stopped",
      captionLagMs: null,
    });
    this.log.push(this.state);
  }

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
    if (event.kind === "capture.state") this.state = event;
    for (const listener of this.listeners) listener([event]);
    return event;
  }

  subscribe(
    listener: (event: CaptionEvent) => void,
    lastEventId?: string,
  ): () => void {
    return this.subscribeBatch(
      (events) => events.forEach(listener),
      lastEventId,
    );
  }

  /** Snapshot entries keep their original cursors; merge retained history in cursor order. */
  subscribeBatch(
    listener: (events: readonly CaptionEvent[]) => void,
    lastEventId?: string,
  ): () => void {
    const cursor = lastEventId === undefined ? NaN : Number(lastEventId);
    const valid =
      Number.isSafeInteger(cursor) && cursor >= 0 && cursor <= this.cursor;
    const oldest = Number(this.log[0]?.cursor ?? this.cursor + 1);
    const replayable = valid && cursor >= oldest - 1;
    const history = replayable
      ? this.log
      : [
          ...new Map(
            [...this.finals, ...this.log, this.state].map((event) => [
              event.cursor,
              event,
            ]),
          ).values(),
        ].sort((a, b) => Number(a.cursor) - Number(b.cursor));
    this.listeners.add(listener);
    listener(
      history.filter((event) => !valid || Number(event.cursor) > cursor),
    );
    return () => this.listeners.delete(listener);
  }
}
