import type {
  CaptionEvent,
  CaptionGapReason,
  CaptureStateEvent,
} from "@simon-says/contracts/caption";

/**
 * Pure caption timeline for the attendee reader. Folds shared SSE caption
 * events into finalized lines, per-window interim text, and gaps. Independent
 * of React and the transport so replays and reconnect snapshots can be tested.
 */

/** A finalized caption line; the highest revision of one segment. */
export type FinalLine = {
  kind: "final";
  key: string;
  segmentId: string;
  revision: number;
  windowId: string;
  startMs: number;
  endMs: number;
  text: string;
};

/** A source range with no transcript. */
export type GapLine = {
  kind: "gap";
  key: string;
  startMs: number;
  endMs: number;
  reason: CaptionGapReason;
};

export type InterimText = {
  windowId: string;
  startMs: number;
  text: string;
};

export type CaptionFeed = {
  /** Finalized lines and gaps in source-clock order. */
  lines: readonly (FinalLine | GapLine)[];
  /** Live, unstored text per transcription window, oldest first. */
  interim: readonly InterimText[];
  capture: Pick<CaptureStateEvent, "session" | "audio" | "reason"> | null;
  /** Latest source-clock time seen in any event; null before the first. */
  sourceMs: number | null;
};

/** Bound memory on long sessions; older lines drop off the reader. */
export const MAX_LINES = 1_000;

export const emptyCaptionFeed: CaptionFeed = {
  lines: [],
  interim: [],
  capture: null,
  sourceMs: null,
};

const byStart = (
  a: { startMs: number; key: string },
  b: { startMs: number; key: string },
) => a.startMs - b.startMs || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

const later = (current: number | null, ms: number) =>
  current === null || ms > current ? ms : current;

const trim = <T>(items: T[]) =>
  items.length > MAX_LINES ? items.slice(items.length - MAX_LINES) : items;

/** Apply one validated caption event. Replays of the same event are no-ops. */
export const applyCaptionEvent = (
  feed: CaptionFeed,
  event: CaptionEvent,
): CaptionFeed => {
  switch (event.kind) {
    case "caption.interim": {
      const interim = feed.interim.filter(
        (entry) => entry.windowId !== event.windowId,
      );
      if (event.text.trim()) {
        interim.push({
          windowId: event.windowId,
          startMs: event.startMs,
          text: event.text,
        });
        interim.sort((a, b) => a.startMs - b.startMs);
      }
      return {
        ...feed,
        interim,
        sourceMs: later(feed.sourceMs, event.estimatedEndMs),
      };
    }
    case "caption.final": {
      const lines = [...feed.lines];
      let sourceMs = feed.sourceMs;
      for (const segment of event.segments) {
        sourceMs = later(sourceMs, segment.endMs);
        const key = `s:${segment.segmentId}`;
        const index = lines.findIndex((line) => line.key === key);
        const existing = index === -1 ? null : lines[index];
        if (
          existing?.kind === "final" &&
          existing.revision >= segment.revision
        ) {
          continue;
        }
        const line: FinalLine = {
          kind: "final",
          key,
          segmentId: segment.segmentId,
          revision: segment.revision,
          windowId: segment.windowId,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
        };
        if (index === -1) lines.push(line);
        else lines[index] = line;
      }
      lines.sort(byStart);
      return {
        ...feed,
        lines: trim(lines.filter((line) => line.kind === "gap" || line.text)),
        interim: feed.interim.filter(
          (entry) => entry.windowId !== event.windowId,
        ),
        sourceMs,
      };
    }
    case "caption.gap": {
      const key = `g:${event.epoch}:${event.startMs}:${event.endMs}`;
      if (feed.lines.some((line) => line.key === key)) return feed;
      const lines = [
        ...feed.lines,
        {
          kind: "gap" as const,
          key,
          startMs: event.startMs,
          endMs: event.endMs,
          reason: event.reason,
        },
      ].sort(byStart);
      return {
        ...feed,
        lines: trim(lines),
        sourceMs: later(feed.sourceMs, event.endMs),
      };
    }
    case "capture.state":
      return {
        ...feed,
        capture: {
          session: event.session,
          audio: event.audio,
          reason: event.reason,
        },
        // Nothing more is being spoken once the session ends.
        interim: event.session === "ended" ? [] : feed.interim,
      };
    case "clock.heartbeat":
      return { ...feed, sourceMs: later(feed.sourceMs, event.sourceMs) };
  }
};

/** Session-clock time as `HH:MM:SS`, for the desktop timestamp column. */
export const formatSourceTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
};
