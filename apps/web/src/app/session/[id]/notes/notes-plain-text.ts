import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { noteEntries } from "./notes-entries";

/**
 * The attendee's own notes as plain text with no Markdown symbols, for copying
 * and sharing: Notes, Keep, and Messages show it as written. Built in the
 * browser; nothing is sent.
 */
export const notesPlainText = (
  title: string,
  bookmarks: readonly BookmarkResponse[],
) => {
  const sections = noteEntries(bookmarks).map(({ label, quote, note }) =>
    [label, quote ? `"${quote}"` : null, note]
      .filter((part): part is string => part !== null)
      .join("\n"),
  );
  return [`My notes: ${title}`, ...sections].join("\n\n");
};
