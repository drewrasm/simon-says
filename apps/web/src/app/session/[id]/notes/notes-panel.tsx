import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import type { ReactNode } from "react";
import { NotesList } from "./notes-list";

type NotesPanelProps = {
  bookmarks: BookmarkResponse[];
  /** The inline note form, rendered above the list. */
  form: ReactNode;
};

/** Desktop side panel: heading, inline note form, the list, and where notes live. */
export const NotesPanel = ({ bookmarks, form }: NotesPanelProps) => (
  <div className="flex flex-col gap-5 p-5">
    <div className="flex flex-col gap-0.5">
      <h2 className="text-lg font-bold">My notes</h2>
      <p className="text-sm text-muted-foreground">
        {bookmarks.length === 1 ? "1 saved" : `${bookmarks.length} saved`}
      </p>
    </div>
    {form}
    <NotesList bookmarks={bookmarks} />
    <p className="text-xs text-muted-foreground">
      Only you can see these. Notes are tied to this browser; clearing its
      cookies or switching devices loses access to them.
    </p>
  </div>
);
