import type {
  CaptionEvent,
  CaptureStateEvent,
} from "@simon-says/contracts/caption";

export type FeedLine = Readonly<{
  key: string;
  /** Capture epoch; each Go live restarts the source clock at zero. */
  epoch: number;
  startMs: number;
  text: string;
  kind: "final" | "interim" | "gap";
}>;

export type CaptionFeed = Readonly<{
  /** Latest revision of each finalized segment, by segment ID. */
  finals: ReadonlyMap<string, Readonly<{ revision: number; line: FeedLine }>>;
  /** Unstored interim text per window; a final for that window removes it. */
  interims: ReadonlyMap<string, FeedLine>;
  gaps: ReadonlyMap<string, FeedLine>;
  capture: CaptureStateEvent | null;
  /** Latest source-clock time the server received from the host. */
  sourceMs: number | null;
}>;

export const emptyFeed: CaptionFeed = {
  finals: new Map(),
  interims: new Map(),
  gaps: new Map(),
  capture: null,
  sourceMs: null,
};

/**
 * Folds one SSE event into the feed. Replays and snapshots may resend events,
 * so finals upsert by segment ID and keep the highest revision.
 */
export const applyCaptionEvent = (
  feed: CaptionFeed,
  event: CaptionEvent,
): CaptionFeed => {
  switch (event.kind) {
    case "caption.interim": {
      const interims = new Map(feed.interims);
      const key = `${event.epoch}:${event.windowId}`;
      if (event.text.trim()) {
        interims.set(key, {
          key: `interim:${key}`,
          epoch: event.epoch,
          startMs: event.startMs,
          text: event.text,
          kind: "interim",
        });
      } else interims.delete(key);
      return { ...feed, interims };
    }
    case "caption.final": {
      const finals = new Map(feed.finals);
      for (const segment of event.segments) {
        const current = finals.get(segment.segmentId);
        if (current && current.revision >= segment.revision) continue;
        finals.set(segment.segmentId, {
          revision: segment.revision,
          line: {
            key: `final:${segment.segmentId}`,
            epoch: event.epoch,
            startMs: segment.startMs,
            text: segment.text,
            kind: "final",
          },
        });
      }
      const interims = new Map(feed.interims);
      interims.delete(`${event.epoch}:${event.windowId}`);
      return { ...feed, finals, interims };
    }
    case "caption.gap": {
      const gaps = new Map(feed.gaps);
      const key = `${event.epoch}:${event.startMs}:${event.endMs}`;
      gaps.set(key, {
        key: `gap:${key}`,
        epoch: event.epoch,
        startMs: event.startMs,
        text:
          event.reason === "audio_missing"
            ? "Audio missing for this part."
            : "Couldn't transcribe this part.",
        kind: "gap",
      });
      return { ...feed, gaps };
    }
    case "capture.state":
      return { ...feed, capture: event };
    case "clock.heartbeat":
      return { ...feed, sourceMs: event.sourceMs };
  }
};

const byEpochThenTime = (a: FeedLine, b: FeedLine) =>
  a.epoch - b.epoch || a.startMs - b.startMs;

/** Finals and gaps in (epoch, source-clock) order, then any interim text still being spoken. */
export const feedLines = (feed: CaptionFeed, limit = 200): FeedLine[] => {
  const settled = [
    ...[...feed.finals.values()].map(({ line }) => line),
    ...feed.gaps.values(),
  ]
    .filter((line) => line.kind === "gap" || line.text.trim())
    .sort(byEpochThenTime);
  const interim = [...feed.interims.values()].sort(byEpochThenTime);
  return [...settled.slice(-limit), ...interim];
};

/** Session-clock milliseconds as "HH:MM:SS". */
export const formatClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
};
