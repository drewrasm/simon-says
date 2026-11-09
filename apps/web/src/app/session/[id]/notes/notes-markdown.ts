import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { noteEntries } from "./notes-entries";

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
  const sections = noteEntries(bookmarks).map(({ label, quote, note }) =>
    [
      `## ${label}`,
      quote ? `> ${plain(quote)}` : null,
      note ? plain(note) : null,
    ]
      .filter((part): part is string => part !== null)
      .join("\n\n"),
  );
  return [`# My notes: ${plain(title)}`, ...sections].join("\n\n") + "\n";
};
