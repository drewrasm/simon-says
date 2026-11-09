import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import type { ReactNode } from "react";
import { NotesExportActions } from "./note-card-actions";
import { NotesList } from "./notes-list";

type NotesPanelProps = {
  title: string;
  bookmarks: BookmarkResponse[];
  /** Panel-level actions, such as Clip last 30s. */
  actions?: ReactNode;
  /** The inline note form, rendered above the list. */
  form: ReactNode;
};

/** Desktop side panel: heading, export, clip and note controls, the list. */
export const NotesPanel = ({
  title,
  bookmarks,
  actions,
  form,
}: NotesPanelProps) => (
  <div className="flex flex-col gap-5 p-5">
    <div className="flex items-start gap-3">
      <div className="flex grow flex-col gap-0.5">
        <h2 className="text-lg font-bold">My notes</h2>
        <p className="text-sm text-muted-foreground">
          {bookmarks.length === 1 ? "1 saved" : `${bookmarks.length} saved`}{" "}
          from {title}
        </p>
      </div>
    </div>
    <NotesExportActions title={title} bookmarks={bookmarks} />
    {actions}
    {form}
    <NotesList bookmarks={bookmarks} />
    <p className="text-xs text-muted-foreground">
      Private to you on this device.
    </p>
  </div>
);
