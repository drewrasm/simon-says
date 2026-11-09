/** Formats session-clock milliseconds as `hh:mm:ss`, e.g. `00:13:24`. */
export const formatTalkTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const parts = [
    Math.floor(total / 3600),
    Math.floor(total / 60) % 60,
    total % 60,
  ];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
};

/**
 * The mark sent for notes until Track 2 records when the capture clock starts.
 * It yields the zero-width range `[0, 0]`, which evidence resolution never
 * matches against captions, so no note gets a quote from the wrong moment.
 */
export const UNPINNED_MARK_MS = 0;

type Pinnable = {
  anchor: { kind: "live"; markedAtMs: number } | { kind: "paragraph" };
  requestedRange: { startMs: number; endMs: number };
};

/** True for a note saved without a place in the talk (see `UNPINNED_MARK_MS`). */
export const isUnpinned = ({ anchor, requestedRange }: Pinnable) =>
  anchor.kind === "live" && requestedRange.startMs === requestedRange.endMs;
