import type { TranscriptSegment } from "@simon-says/contracts/caption";

type AcknowledgedRevisions = Map<string, number>;
type VisibleRevisions = ReadonlyMap<string, { revision: number }>;

declare global {
  var simonSaysUnsearchedSegments:
    Map<string, AcknowledgedRevisions> | undefined;
}

// The capture server and Next route handlers are bundled separately but share
// one process, so the registry lives on globalThis.
const unsearchedSegments = () =>
  (globalThis.simonSaysUnsearchedSegments ??= new Map());

// Search returns `unavailable` above 1,000 segments, so more entries never change its answer.
const maxSegmentsPerSession = 1001;
const maxSessions = 100;

/** Call only after Elasticsearch acknowledged the write. */
export const recordAcknowledgedSegments = (
  segments: readonly TranscriptSegment[],
) => {
  const sessions = unsearchedSegments();

  for (const { sessionId, segmentId, revision } of segments) {
    const acknowledged: AcknowledgedRevisions =
      sessions.get(sessionId) ?? new Map();

    const tracked = acknowledged.has(segmentId);
    if (
      (tracked || acknowledged.size < maxSegmentsPerSession) &&
      revision > (acknowledged.get(segmentId) ?? 0)
    )
      acknowledged.set(segmentId, revision);

    // Reinsert so iteration order is least recently written first.
    sessions.delete(sessionId);
    sessions.set(sessionId, acknowledged);
  }

  for (const sessionId of sessions.keys()) {
    if (sessions.size <= maxSessions) break;
    sessions.delete(sessionId);
  }
};

/** True while a segment this process wrote is missing from `visible`. */
export const hasUnsearchableSegments = (
  sessionId: string,
  visible: VisibleRevisions,
) => {
  const acknowledged = unsearchedSegments().get(sessionId);
  if (!acknowledged) return false;

  for (const [segmentId, revision] of acknowledged) {
    if ((visible.get(segmentId)?.revision ?? 0) >= revision)
      acknowledged.delete(segmentId);
  }
  if (acknowledged.size > 0) return true;

  unsearchedSegments().delete(sessionId);
  return false;
};
