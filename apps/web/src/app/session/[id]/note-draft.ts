import type { BookmarkAnchor } from "@simon-says/contracts/bookmark";
import type { NoteDraft } from "./save-note";

type NewId = () => string;

/** The same draft under new IDs, so a send can't collide with an earlier one. */
export const withFreshIds = <
  Draft extends { bookmarkId: string; operationId: string },
>(
  draft: Draft,
  newId: NewId,
): Draft => ({
  ...draft,
  bookmarkId: newId(),
  operationId: newId(),
});

/** What a send stores: two attempts with equal keys are the same content. */
export const attemptKey = (text: string, anchor: BookmarkAnchor) =>
  JSON.stringify([text, anchor]);

/**
 * The draft to send. An identical resend keeps its IDs, so a retry after a lost
 * response stays idempotent. Content changed after an attempt (edited text, or
 * a quote attached or removed) gets new IDs: the earlier attempt may already be
 * saved under the old ones, and the server rightly refuses different content
 * there.
 */
export const draftForAttempt = (
  draft: NoteDraft,
  sentKey: string | null,
  key: string,
  newId: NewId,
): NoteDraft =>
  sentKey !== null && sentKey !== key ? withFreshIds(draft, newId) : draft;
