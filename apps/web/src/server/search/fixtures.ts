import { syntheticSegment } from "../evidence/fixtures";

// Synthetic finalized sources matching infra/elasticsearch/segments-v1.json.
export const searchHit = (source = syntheticSegment(), score = 1) => ({
  _source: source,
  sort: [score, source.segmentId, source.epoch, source.revision],
});
export const searchPage = (hits: unknown[], total = hits.length) => ({
  timed_out: false,
  _shards: { failed: 0 },
  hits: { total: { value: total, relation: "eq" }, hits },
});
export const searchBatch = (
  hits: ReturnType<typeof searchHit>[],
  revisions = hits,
  hybrid: unknown = searchPage(hits),
) => ({
  responses: [hybrid, searchPage(hits), searchPage(revisions)],
});
