import {
  bookmarkResponseSchema,
  putBookmarkRequestSchema,
  type BookmarkResponse,
  type PutBookmarkRequest,
} from "@simon-says/contracts/bookmark";

export type PutBookmarkResult =
  | { kind: "saved"; bookmark: BookmarkResponse }
  | { kind: "rejected" }
  | { kind: "conflict" }
  | { kind: "error" };

/**
 * `PUT /api/bookmarks/:id` from the browser. Callers keep `bookmarkId` and
 * `operationId` fixed across retries so a resend after a lost response is
 * idempotent.
 */
export const putBookmark = async (
  bookmarkId: string,
  request: PutBookmarkRequest,
  fetcher: typeof fetch = fetch,
): Promise<PutBookmarkResult> => {
  const body = putBookmarkRequestSchema.safeParse(request);
  if (!body.success) return { kind: "rejected" };

  let response: Response;
  try {
    response = await fetcher(`/api/bookmarks/${bookmarkId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body.data),
    });
  } catch {
    return { kind: "error" };
  }
  // 404 covers lost access and a superseded or expired caption line.
  if (response.status === 400 || response.status === 404) {
    return { kind: "rejected" };
  }
  // The IDs are already taken by different content, or the edit is stale.
  if (response.status === 409) return { kind: "conflict" };
  // 503 `source_unavailable` and other failures are worth retrying.
  if (!response.ok) return { kind: "error" };

  const parsed = bookmarkResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success
    ? { kind: "saved", bookmark: parsed.data }
    : { kind: "error" };
};

/**
 * Adds or replaces the note on an existing bookmark. Uses the bookmark's
 * current revision so a stale edit conflicts instead of overwriting.
 */
export const updateBookmarkNote = (
  bookmark: Pick<BookmarkResponse, "id" | "sessionId" | "revision" | "anchor">,
  note: string,
  operationId: string,
  fetcher: typeof fetch = fetch,
) =>
  putBookmark(
    bookmark.id,
    {
      sessionId: bookmark.sessionId,
      operationId,
      expectedRevision: bookmark.revision,
      anchor: bookmark.anchor,
      note,
    },
    fetcher,
  );

/** `DELETE /api/bookmarks/:id`; resolves true once it is gone (204). */
export const deleteBookmark = async (
  bookmarkId: string,
  fetcher: typeof fetch = fetch,
) => {
  try {
    const response = await fetcher(`/api/bookmarks/${bookmarkId}`, {
      method: "DELETE",
    });
    return response.ok;
  } catch {
    return false;
  }
};
