import type { BookmarkAnchor } from "@simon-says/contracts/bookmark";
import {
  searchResponseSchema,
  type SearchResponse,
  type SearchResult,
} from "@simon-says/contracts/search";

export type SearchSessionResult =
  { kind: "ok"; response: SearchResponse } | { kind: "error" };

/** `POST /api/sessions/:id/search` for passages that match by meaning. */
export const searchSession = async (
  sessionId: string,
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<SearchSessionResult> => {
  let response: Response;
  try {
    response = await fetcher(`/api/sessions/${sessionId}/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
  } catch {
    return { kind: "error" };
  }
  if (!response.ok) return { kind: "error" };

  const parsed = searchResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success
    ? { kind: "ok", response: parsed.data }
    : { kind: "error" };
};

/** Saves a result as the exact passage found, timestamps intact. */
export const searchResultAnchor = (result: SearchResult): BookmarkAnchor => ({
  kind: "paragraph",
  segmentId: result.segmentId,
  segmentRevision: result.segmentRevision,
  range: result.range,
});
