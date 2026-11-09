import {
  bookmarkResponseSchema,
  putBookmarkRequestSchema,
  type BookmarkResponse,
} from "@simon-says/contracts/bookmark";

export type NoteDraft = {
  bookmarkId: string;
  operationId: string;
  sessionId: string;
  markedAtMs: number;
};

export type SaveNoteResult =
  | { kind: "saved"; bookmark: BookmarkResponse }
  | { kind: "rejected" }
  | { kind: "error" };

/**
 * Creates a live-anchored note through `PUT /api/bookmarks/:id`. The draft's IDs
 * stay fixed across retries, so a retry after a lost response is idempotent.
 */
export const saveNote = async (
  draft: NoteDraft,
  note: string,
  fetcher: typeof fetch = fetch,
): Promise<SaveNoteResult> => {
  const body = putBookmarkRequestSchema.safeParse({
    sessionId: draft.sessionId,
    operationId: draft.operationId,
    expectedRevision: null,
    anchor: { kind: "live", markedAtMs: draft.markedAtMs },
    note,
  });
  if (!body.success) return { kind: "rejected" };

  let response: Response;
  try {
    response = await fetcher(`/api/bookmarks/${draft.bookmarkId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body.data),
    });
  } catch {
    return { kind: "error" };
  }
  if (response.status === 400 || response.status === 404) {
    return { kind: "rejected" };
  }
  if (!response.ok) return { kind: "error" };

  const parsed = bookmarkResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success
    ? { kind: "saved", bookmark: parsed.data }
    : { kind: "error" };
};
