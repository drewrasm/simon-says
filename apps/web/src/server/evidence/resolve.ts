import "server-only";

import { z } from "zod";
import { transcriptSegmentSchema } from "@simon-says/contracts/caption";
import type {
  BookmarkAnchor,
  BookmarkResponse,
  SourceRange,
} from "@simon-says/contracts/bookmark";
import { searchSources } from "./elasticsearch";
import { AccessError } from "../access/errors";

const expiresAt = z.iso.datetime({ offset: true }).nullable().optional();
const segmentSchema = transcriptSegmentSchema.safeExtend({ expiresAt });
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
    evidence: { segments: [] },
    actualRange: null,
    completeness: "pending",
    clockUncertaintyMs: 0,
  };
  if (range.startMs === range.endMs) return pending;

  try {
    const signal = AbortSignal.timeout(2000);
    const sessionFilter = { term: { sessionId } };
    const candidates = await searchSources({
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
    });

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
    if (!segments.length) return pending;

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

export class SourceUnavailable extends Error {}

export const requireParagraphSource = async ({
  sessionId,
  anchor,
}: {
  sessionId: string;
  anchor: Extract<BookmarkAnchor, { kind: "paragraph" }>;
}) => {
  let sources: z.infer<typeof segmentSchema>[];
  try {
    sources = await searchSources({
      index: "simon-says-segments",
      schema: segmentSchema,
      signal: AbortSignal.timeout(2000),
      latestOnly: true,
      query: {
        bool: {
          filter: [
            { term: { sessionId } },
            { term: { segmentId: anchor.segmentId } },
          ],
        },
      },
      sort: [{ revision: "desc" }],
    });
  } catch {
    throw new SourceUnavailable("source_unavailable");
  }
  const source = sources[0];
  if (
    !source ||
    source.sessionId !== sessionId ||
    source.segmentId !== anchor.segmentId ||
    source.revision !== anchor.segmentRevision ||
    !unexpired(source, Date.now()) ||
    anchor.range.startMs < source.startMs ||
    anchor.range.endMs > source.endMs
  ) {
    throw new AccessError(404, "not_found");
  }
};
