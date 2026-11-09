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

/** Call only after Elasticsearch acknowledged the write. */
export const recordAcknowledgedSegments = (
  segments: readonly TranscriptSegment[],
) => {
  for (const { sessionId, segmentId, revision } of segments) {
    const acknowledged: AcknowledgedRevisions =
      unsearchedSegments().get(sessionId) ?? new Map();

    if (revision > (acknowledged.get(segmentId) ?? 0))
      acknowledged.set(segmentId, revision);
    unsearchedSegments().set(sessionId, acknowledged);
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
