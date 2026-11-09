import "server-only";

import { z } from "zod";
import { transcriptSegmentSchema } from "@simon-says/contracts/caption";
import type {
  BookmarkAnchor,
  BookmarkResponse,
  SourceRange,
} from "@simon-says/contracts/bookmark";
import { searchSources } from "./elasticsearch";

const expiresAt = z.iso.datetime({ offset: true }).nullable().optional();
const segmentSchema = transcriptSegmentSchema.safeExtend({ expiresAt });
const observationSchema = z.object({
  sessionId: transcriptSegmentSchema.shape.sessionId,
  frameId: transcriptSegmentSchema.shape.sessionId,
  captureMs: z.number().nonnegative(),
  captureState: z.string(),
  expiresAt,
});

type Resolution = Pick<
  BookmarkResponse,
  "evidence" | "actualRange" | "completeness" | "clockUncertaintyMs"
>;
type ResolveOptions = { sessionId: string; range: SourceRange };

export const requestedRange = (anchor: BookmarkAnchor): SourceRange =>
  anchor.kind === "live"
    ? {
        startMs: Math.max(0, anchor.markedAtMs - 30_000),
        endMs: anchor.markedAtMs,
      }
    : anchor.range;

const overlaps = (source: SourceRange, range: SourceRange) =>
  source.startMs < range.endMs && source.endMs > range.startMs;

const unexpired = (
  source: { expiresAt?: string | null | undefined },
  now: number,
) => !source.expiresAt || Date.parse(source.expiresAt) > now;

export const resolveEvidence = async ({
  sessionId,
  range,
}: ResolveOptions): Promise<Resolution> => {
  const pending: Resolution = {
    evidence: { segments: [], frames: [] },
    actualRange: null,
    completeness: "pending",
    clockUncertaintyMs: 0,
  };
  if (range.startMs === range.endMs) return pending;

  try {
    const signal = AbortSignal.timeout(2000);
    const sessionFilter = { term: { sessionId } };
    const [candidates, atStart, inside] = await Promise.all([
      searchSources({
        index: "simon-says-segments",
        schema: segmentSchema,
        signal,
        query: {
          bool: {
            filter: [
              sessionFilter,
              { range: { startMs: { lt: range.endMs } } },
              { range: { endMs: { gt: range.startMs } } },
            ],
          },
        },
        sort: [{ segmentId: "asc" }, { revision: "desc" }],
      }),
      searchSources({
        index: "simon-says-observations",
        schema: observationSchema,
        signal,
        latestOnly: true,
        query: {
          bool: {
            filter: [
              sessionFilter,
              { range: { captureMs: { lte: range.startMs } } },
            ],
          },
        },
        sort: [{ captureMs: "desc" }, { observationId: "asc" }],
      }),
      searchSources({
        index: "simon-says-observations",
        schema: observationSchema,
        signal,
        query: {
          bool: {
            filter: [
              sessionFilter,
              { range: { captureMs: { gt: range.startMs, lte: range.endMs } } },
            ],
          },
        },
        sort: [{ captureMs: "asc" }, { observationId: "asc" }],
      }),
    ]);

    // A correction can move outside the range; never fall back to its older text.
    const revisions = candidates.length
      ? await searchSources({
          index: "simon-says-segments",
          schema: segmentSchema,
          signal,
          query: {
            bool: {
              filter: [
                sessionFilter,
                {
                  terms: {
                    segmentId: [...new Set(candidates.map((s) => s.segmentId))],
                  },
                },
              ],
            },
          },
          sort: [{ segmentId: "asc" }, { revision: "desc" }],
        })
      : [];
    const latest = new Map<string, z.infer<typeof segmentSchema>>();
    for (const segment of revisions) {
      if (segment.sessionId !== sessionId)
        throw new Error("Invalid source session");
      const previous = latest.get(segment.segmentId);
      if (!previous || segment.revision > previous.revision)
        latest.set(segment.segmentId, segment);
    }

    const now = Date.now();
    const segments = [...latest.values()]
      .filter((s) => unexpired(s, now) && overlaps(s, range))
      .sort(
        (a, b) =>
          a.startMs - b.startMs || a.segmentId.localeCompare(b.segmentId),
      );
    const observations = [...atStart, ...inside];
    if (observations.some((o) => o.sessionId !== sessionId))
      throw new Error("Invalid source session");
    const frames = observations
      .filter(
        (o) =>
          o.captureState !== "stopped" &&
          unexpired(o, now) &&
          o.captureMs <= range.endMs,
      )
      .map((o) => ({
        frameId: o.frameId,
        capturedAtMs: o.captureMs,
        imageUrl: null,
      }));
    if (!segments.length && !frames.length) return pending;

    let coveredThrough = range.startMs;
    let hasGap = false;
    for (const segment of segments) {
      if (segment.startMs > coveredThrough) hasGap = true;
      coveredThrough = Math.max(
        coveredThrough,
        Math.min(segment.endMs, range.endMs),
      );
    }
    const first = segments[0];
    return {
      evidence: {
        segments: segments.map((s) => ({
          segmentId: s.segmentId,
          revision: s.revision,
          range: { startMs: s.startMs, endMs: s.endMs },
          text: s.text,
        })),
        frames,
      },
      actualRange: first
        ? {
            startMs: Math.max(range.startMs, first.startMs),
            endMs: coveredThrough,
          }
        : null,
      completeness:
        first && !hasGap && coveredThrough >= range.endMs
          ? "complete"
          : "incomplete",
      clockUncertaintyMs: segments.reduce(
        (max, s) => Math.max(max, s.timing.uncertaintyMs),
        0,
      ),
    };
  } catch {
    return pending;
  }
};
