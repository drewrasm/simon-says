import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import type { ReactNode } from "react";
import { NotesExportActions } from "./note-card-actions";
import { NotesList } from "./notes-list";
import { RecapSection } from "./recap-section";
import { SearchSection } from "./search-section";

type NotesPanelProps = {
  sessionId: string;
  title: string;
  bookmarks: BookmarkResponse[];
  /** The inline note form, rendered above the list. */
  form: ReactNode;
};

/** Desktop side panel: heading, export, note form, the list. */
export const NotesPanel = ({
  sessionId,
  title,
  bookmarks,
  form,
}: NotesPanelProps) => (
  <div className="flex flex-col gap-4 p-5">
    <div className="flex items-start gap-3">
      <div className="flex grow flex-col gap-0.5">
        <h2 className="text-base leading-tight font-semibold">My notes</h2>
        <p className="text-[13px] text-muted-foreground">
          {bookmarks.length === 1 ? "1 saved" : `${bookmarks.length} saved`}{" "}
          from {title}
        </p>
      </div>
    </div>
    <NotesExportActions title={title} bookmarks={bookmarks} />
    <RecapSection sessionId={sessionId} bookmarks={bookmarks} />
    <SearchSection sessionId={sessionId} />
    {form}
    <NotesList bookmarks={bookmarks} />
    <p className="text-xs leading-normal text-muted-foreground">
      Private to you on this device.
    </p>
  </div>
);
