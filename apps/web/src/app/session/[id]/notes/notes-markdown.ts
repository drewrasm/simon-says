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

/** Escapes characters Markdown would read as structure at a line start. */
const plain = (text: string) =>
  text.replace(/([\\`*_[\]#<>|])/g, "\\$1").replace(/\r?\n/g, "  \n");

/**
 * The attendee's own notes as portable Markdown, oldest first so it reads in
 * talk order. Built in the browser from data already shown; nothing is sent.
 */
export const notesMarkdown = (
  title: string,
  bookmarks: readonly BookmarkResponse[],
) => {
  const ordered = [...bookmarks].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const sections = ordered.map((bookmark) => {
    const quote = quoteText(bookmark);
    const heading = isUnpinned(bookmark)
      ? `## Note · saved ${bookmark.createdAt}`
      : `## ${quote ? "Clip" : "Note"} · ${momentLabel(bookmark)}`;
    return [
      heading,
      quote ? `> ${plain(quote)}` : null,
      bookmark.note ? plain(bookmark.note) : null,
    ]
      .filter((part): part is string => part !== null)
      .join("\n\n");
  });
  return [`# My notes: ${plain(title)}`, ...sections].join("\n\n") + "\n";
};
