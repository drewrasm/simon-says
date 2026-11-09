import type { BookmarkAnchor } from "@simon-says/contracts/bookmark";
import { putBookmark, type PutBookmarkResult } from "./bookmark-client";

export type NoteDraft = {
  bookmarkId: string;
  operationId: string;
  sessionId: string;
  /** A live mark at the talk time, or a paragraph on an attached line. */
  anchor: BookmarkAnchor;
};

export type SaveNoteResult = PutBookmarkResult;

/**
 * Creates a note through `PUT /api/bookmarks/:id`. The draft's IDs stay fixed
 * across retries, so a retry after a lost response is idempotent.
 */
export const saveNote = (
  draft: NoteDraft,
  note: string,
  fetcher: typeof fetch = fetch,
): Promise<SaveNoteResult> =>
  putBookmark(
    draft.bookmarkId,
    {
      sessionId: draft.sessionId,
      operationId: draft.operationId,
      expectedRevision: null,
      anchor: draft.anchor,
      note,
    },
    fetcher,
  );
