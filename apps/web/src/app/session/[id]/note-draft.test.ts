import { describe, expect, it } from "vitest";
import { attemptKey, draftForAttempt, withFreshIds } from "./note-draft";
import type { NoteDraft } from "./save-note";

const draft: NoteDraft = {
  bookmarkId: "b-1",
  operationId: "o-1",
  sessionId: "s-1",
  anchor: { kind: "live", markedAtMs: 804_000 },
};

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

const live = attemptKey("Note", draft.anchor);

describe("draftForAttempt", () => {
  it("keeps the IDs on a first attempt", () => {
    expect(draftForAttempt(draft, null, live, ids())).toBe(draft);
  });

  it("keeps the IDs when resending the same content", () => {
    expect(
      draftForAttempt(draft, live, attemptKey("Note", draft.anchor), ids()),
    ).toBe(draft);
  });

  it("renews the IDs but keeps the pin when the text changed", () => {
    expect(
      draftForAttempt(draft, live, attemptKey("Edited", draft.anchor), ids()),
    ).toEqual({ ...draft, bookmarkId: "new-1", operationId: "new-2" });
  });

  it("renews the IDs when a quote was attached after an attempt", () => {
    const attached = attemptKey("Note", {
      kind: "paragraph",
      segmentId: "seg-1",
      segmentRevision: 1,
      range: { startMs: 800_000, endMs: 804_000 },
    });
    expect(draftForAttempt(draft, live, attached, ids()).bookmarkId).toBe(
      "new-1",
    );
  });
});

describe("withFreshIds", () => {
  it("changes only the IDs", () => {
    expect(withFreshIds(draft, ids())).toEqual({
      sessionId: "s-1",
      anchor: { kind: "live", markedAtMs: 804_000 },
      bookmarkId: "new-1",
      operationId: "new-2",
    });
  });
});
