import type { BookmarkAnchor } from "@simon-says/contracts/bookmark";
import type { TranscriptSegment } from "@simon-says/contracts/caption";
import { formatTalkTime } from "./talk-time";

/**
 * One finalized caption line the attendee can clip: the latest revision of a
 * transcript segment, on the session source clock.
 */
export type ClipLine = Pick<
  TranscriptSegment,
  "segmentId" | "revision" | "startMs" | "endMs" | "text"
>;

/** The paragraph anchor that saves exactly this line's source range. */
export const paragraphAnchor = (line: ClipLine): BookmarkAnchor => ({
  kind: "paragraph",
  segmentId: line.segmentId,
  segmentRevision: line.revision,
  range: { startMs: line.startMs, endMs: line.endMs },
});

/** Lines in transcript order, so a selection reads the way it was spoken. */
export const inSpokenOrder = (lines: readonly ClipLine[]) =>
  [...lines].sort(
    (a, b) => a.startMs - b.startMs || a.segmentId.localeCompare(b.segmentId),
  );

/** The selected lines, in the order they appear in the transcript. */
export const selectedLines = (
  lines: readonly ClipLine[],
  selectedIds: readonly string[],
) => {
  const ids = new Set(selectedIds);
  return inSpokenOrder(lines.filter(({ segmentId }) => ids.has(segmentId)));
};

/** "2 lines · 00:12:47 – 00:12:55", or one time for a single line. */
export const clipLabel = (lines: readonly ClipLine[]) => {
  const ordered = inSpokenOrder(lines);
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last) return "No lines";
  const count = ordered.length === 1 ? "1 line" : `${ordered.length} lines`;
  const start = formatTalkTime(first.startMs);
  const end = formatTalkTime(last.endMs);
  return start === end ? `${count} · ${start}` : `${count} · ${start} – ${end}`;
};

/** The quote as one passage, in spoken order. */
export const clipQuote = (lines: readonly ClipLine[]) =>
  inSpokenOrder(lines)
    .map(({ text }) => text.trim())
    .join(" ");

/**
 * Grows a contiguous run of selected lines by the neighbouring line before or
 * after it in `all`. Returns the IDs unchanged when there is no neighbour.
 */
export const extendSelection = (
  all: readonly ClipLine[],
  selectedIds: readonly string[],
  side: "before" | "after",
): string[] => {
  const ordered = inSpokenOrder(all);
  const ids = new Set(selectedIds);
  const indexes = ordered
    .map((line, index) => (ids.has(line.segmentId) ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length === 0) return [...selectedIds];
  const next =
    side === "before" ? Math.min(...indexes) - 1 : Math.max(...indexes) + 1;
  const neighbour = ordered[next];
  return neighbour ? [...selectedIds, neighbour.segmentId] : [...selectedIds];
};

/**
 * The latest point on the source clock that captions have reached, or null
 * before the first finalized line. Captions arrive after the words are spoken,
 * so this trails the room by the provider's lag.
 */
export const latestTalkMs = (lines: readonly ClipLine[]) =>
  lines.length === 0 ? null : Math.max(...lines.map(({ endMs }) => endMs));

/** The most recently finished line, for "attach what was just said". */
export const lastLine = (lines: readonly ClipLine[]) =>
  inSpokenOrder(lines).at(-1) ?? null;
