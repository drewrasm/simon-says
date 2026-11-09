import type { NoteDraft } from "./save-note";

type NewId = () => string;

/** The same pinned moment under new IDs, so a send can't collide with an earlier one. */
export const withFreshIds = (draft: NoteDraft, newId: NewId): NoteDraft => ({
  ...draft,
  bookmarkId: newId(),
  operationId: newId(),
});

/**
 * The draft to send. An identical resend keeps its IDs, so a retry after a lost
 * response stays idempotent. Text edited after an attempt gets new IDs: the
 * earlier attempt may already be saved under the old ones, and the server
 * rightly refuses different content there.
 */
export const draftForAttempt = (
  draft: NoteDraft,
  sentText: string | null,
  text: string,
  newId: NewId,
): NoteDraft =>
  sentText !== null && sentText !== text ? withFreshIds(draft, newId) : draft;
