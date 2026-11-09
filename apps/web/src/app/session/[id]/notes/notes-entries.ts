import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { formatTalkTime, isUnpinned } from "../talk-time";

/** The talk time of a card: a mark's moment, or a clip's source range. */
export const momentLabel = (bookmark: BookmarkResponse) => {
  if (bookmark.anchor.kind === "live") {
    return formatTalkTime(bookmark.anchor.markedAtMs);
  }
  const { startMs, endMs } = bookmark.requestedRange;
  const start = formatTalkTime(startMs);
  const end = formatTalkTime(endMs);
  return start === end ? start : `${start} – ${end}`;
};

/** The quoted captions, in source order. */
export const quoteText = (bookmark: BookmarkResponse) =>
  [...bookmark.evidence.segments]
    .sort((a, b) => a.range.startMs - b.range.startMs)
    .map(({ text }) => text.trim())
    .join(" ");

/** One saved card as export text, before any format-specific escaping. */
export type NoteEntry = {
  label: string;
  quote: string | null;
  note: string | null;
};

/**
 * The attendee's own cards, oldest first so they read in talk order. Every
 * export format renders these entries, so they stay in step.
 */
export const noteEntries = (
  bookmarks: readonly BookmarkResponse[],
): NoteEntry[] =>
  [...bookmarks]
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .map((bookmark) => {
      const quote = quoteText(bookmark);
      const label = isUnpinned(bookmark)
        ? `Note · saved ${bookmark.createdAt}`
        : `${quote ? "Clip" : "Note"} · ${momentLabel(bookmark)}`;
      return {
        label,
        quote: quote || null,
        note: bookmark.note || null,
      };
    });
