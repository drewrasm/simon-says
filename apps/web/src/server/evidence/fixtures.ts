import { transcriptSegmentSchema } from "@simon-says/contracts/caption";
import type { TranscriptSegment } from "@simon-says/contracts/caption";

// Synthetic HTTP fixtures matching caption.ts and the Elasticsearch v1 mappings.
export const syntheticSegment = (
  overrides: Partial<TranscriptSegment> = {},
) => ({
  ...transcriptSegmentSchema.parse({
    sessionId: "synthetic-session",
    epoch: 1,
    windowId: "window-1",
    segmentId: "segment-1",
    revision: 1,
    startMs: 0,
    endMs: 30_000,
    timing: { kind: "estimated", uncertaintyMs: 1500 },
    text: "Synthetic spoken passage.",
    provenance: "live",
    ...overrides,
  }),
  expiresAt: "2099-01-01T00:00:00.000Z",
});

export const syntheticSearchResponse = (sources: unknown[]) => ({
  took: 1,
  timed_out: false,
  _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
  hits: {
    total: { value: sources.length, relation: "eq" },
    max_score: null,
    hits: sources.map((_source) => ({ _source })),
  },
});
