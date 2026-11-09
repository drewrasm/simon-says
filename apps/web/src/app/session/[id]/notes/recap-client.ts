import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import {
  createRecapResponseSchema,
  maxRecapBookmarks,
  recapResponseSchema,
  type CreateRecapRequest,
  type RecapResponse,
} from "@simon-says/contracts/recap";

/** The clips a recap can cite: those whose captions have resolved. */
export const recapSelection = (
  bookmarks: BookmarkResponse[],
): CreateRecapRequest["bookmarks"] =>
  bookmarks
    .filter(({ evidence }) => evidence.segments.length > 0)
    .slice(0, maxRecapBookmarks)
    .map(({ id, revision }) => ({
      bookmarkId: id,
      expectedRevision: revision,
    }));

export type CreateRecapResult =
  | { kind: "created"; id: string }
  | { kind: "busy" }
  | { kind: "conflict" }
  | { kind: "rejected" }
  | { kind: "error" };

/**
 * `POST /api/sessions/:id/recaps`. Callers keep `operationId` fixed across
 * retries of one attempt so a resend after a lost response is idempotent.
 */
export const createRecap = async (
  sessionId: string,
  request: CreateRecapRequest,
  fetcher: typeof fetch = fetch,
): Promise<CreateRecapResult> => {
  let response: Response;
  try {
    response = await fetcher(`/api/sessions/${sessionId}/recaps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return { kind: "error" };
  }
  if (response.status === 429) return { kind: "busy" };
  // A selected clip was edited or removed after this page loaded.
  if (response.status === 409) return { kind: "conflict" };
  if (response.status === 400 || response.status === 404) {
    return { kind: "rejected" };
  }
  if (!response.ok) return { kind: "error" };

  const parsed = createRecapResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success
    ? { kind: "created", id: parsed.data.id }
    : { kind: "error" };
};

export type GetRecapResult =
  | { kind: "ok"; recap: RecapResponse }
  | { kind: "missing" }
  | { kind: "error" };

/** `GET /api/me/recaps/:id`; owner-only, so anyone else gets `missing`. */
export const getRecap = async (
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<GetRecapResult> => {
  let response: Response;
  try {
    response = await fetcher(`/api/me/recaps/${id}`, { cache: "no-store" });
  } catch {
    return { kind: "error" };
  }
  if (response.status === 404) return { kind: "missing" };
  if (!response.ok) return { kind: "error" };

  const parsed = recapResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success
    ? { kind: "ok", recap: parsed.data }
    : { kind: "error" };
};

export const recapExportHref = (id: string) => `/api/me/recaps/${id}/export`;
