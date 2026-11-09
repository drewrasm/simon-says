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
 * Reads the session clock on the client from the server's elapsed time at
 * render plus monotonic time since, so device clock skew never moves a mark.
 */
export const createSessionClock = (
  elapsedAtRenderMs: number,
  readMonotonicMs: () => number = () => performance.now(),
) => {
  const startedAt = readMonotonicMs();
  return () => elapsedAtRenderMs + (readMonotonicMs() - startedAt);
};
