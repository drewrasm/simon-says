import { putBookmark, type PutBookmarkResult } from "./bookmark-client";
import { inSpokenOrder, paragraphAnchor, type ClipLine } from "./clip-line";

/** One selected line and the IDs it is saved under. */
export type ClipPart = {
  line: ClipLine;
  bookmarkId: string;
  operationId: string;
  saved: boolean;
};

export type ClipDraft = { sessionId: string; parts: ClipPart[] };

type NewId = () => string;

/**
 * A clip of selected lines. A paragraph mark covers one caption segment, so a
 * clip saves one bookmark per line; the note goes with the first line.
 */
export const startClip = (
  sessionId: string,
  lines: readonly ClipLine[],
  newId: NewId,
): ClipDraft => ({
  sessionId,
  parts: inSpokenOrder(lines).map((line) => ({
    line,
    bookmarkId: newId(),
    operationId: newId(),
    saved: false,
  })),
});

export type SaveClipResult =
  | { kind: "saved"; draft: ClipDraft }
  | {
      kind: Exclude<PutBookmarkResult["kind"], "saved">;
      /** Parts saved so far are marked; a retry sends only the rest. */
      draft: ClipDraft;
    };

/**
 * Saves each unsaved line in order and stops at the first failure. Retrying
 * the returned draft reuses each line's IDs, so a resend is idempotent.
 */
export const saveClip = async (
  draft: ClipDraft,
  note: string,
  fetcher: typeof fetch = fetch,
): Promise<SaveClipResult> => {
  const parts = [...draft.parts];
  for (const [index, part] of parts.entries()) {
    if (part.saved) continue;
    const result = await putBookmark(
      part.bookmarkId,
      {
        sessionId: draft.sessionId,
        operationId: part.operationId,
        expectedRevision: null,
        anchor: paragraphAnchor(part.line),
        ...(index === 0 && note ? { note } : {}),
      },
      fetcher,
    );
    if (result.kind !== "saved") {
      return { kind: result.kind, draft: { ...draft, parts } };
    }
    parts[index] = { ...part, saved: true };
  }
  return { kind: "saved", draft: { ...draft, parts } };
};

export const savedCount = (draft: ClipDraft) =>
  draft.parts.filter(({ saved }) => saved).length;
