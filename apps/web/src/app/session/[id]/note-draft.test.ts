import { describe, expect, it } from "vitest";
import { draftForAttempt, withFreshIds } from "./note-draft";
import type { NoteDraft } from "./save-note";

const draft: NoteDraft = {
  bookmarkId: "b-1",
  operationId: "o-1",
  sessionId: "s-1",
  markedAtMs: 804_000,
};

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

describe("draftForAttempt", () => {
  it("keeps the IDs on a first attempt", () => {
    expect(draftForAttempt(draft, null, "Note", ids())).toBe(draft);
  });

  it("keeps the IDs when resending the same text", () => {
    expect(draftForAttempt(draft, "Note", "Note", ids())).toBe(draft);
  });

  it("renews the IDs but keeps the pin when the text changed", () => {
    expect(draftForAttempt(draft, "Note", "Edited note", ids())).toEqual({
      ...draft,
      bookmarkId: "new-1",
      operationId: "new-2",
    });
  });
});

describe("withFreshIds", () => {
  it("changes only the IDs", () => {
    expect(withFreshIds(draft, ids())).toEqual({
      sessionId: "s-1",
      markedAtMs: 804_000,
      bookmarkId: "new-1",
      operationId: "new-2",
    });
  });
});
