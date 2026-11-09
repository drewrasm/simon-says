import { describe, expect, it } from "vitest";
import type { ClipLine } from "./clip-line";
import { startClip, type ClipDraft } from "./save-clip";
import { reuseDraft } from "./use-clip-save";

const line = (n: number): ClipLine => ({
  segmentId: `seg-${n}`,
  revision: 1,
  startMs: n * 5_000,
  endMs: n * 5_000 + 5_000,
  text: `Line ${n}.`,
});

let id = 0;
const newId = () => `id-${++id}`;

const partlySaved = (lines: ClipLine[]): ClipDraft => {
  const draft = startClip("s1", lines, newId);
  return {
    ...draft,
    parts: draft.parts.map((part, i) => ({ ...part, saved: i === 0 })),
  };
};

describe("reuseDraft", () => {
  it("retries the same lines and note with the same draft", () => {
    const draft = startClip("s1", [line(1)], newId);
    expect(
      reuseDraft({
        draft,
        sentKey: "k",
        key: "k",
        lines: [line(1)],
        finishLocked: false,
      }),
    ).toBe(true);
  });

  it("starts over for a new selection when nothing was saved", () => {
    const draft = startClip("s1", [line(1)], newId);
    expect(
      reuseDraft({
        draft,
        sentKey: "k",
        key: "other",
        lines: [line(2)],
        finishLocked: true,
      }),
    ).toBe(false);
  });

  it("finishes a partly saved clip when the sheet locks it", () => {
    const draft = partlySaved([line(1), line(2)]);
    expect(
      reuseDraft({
        draft,
        sentKey: "k",
        key: "other",
        lines: [line(3)],
        finishLocked: true,
      }),
    ).toBe(true);
  });

  it("starts a new clip on desktop when the selection changed after a partial save", () => {
    const draft = partlySaved([line(1), line(2)]);
    expect(
      reuseDraft({
        draft,
        sentKey: "k",
        key: "other",
        lines: [line(3)],
        finishLocked: false,
      }),
    ).toBe(false);
  });

  it("finishes the partly saved clip on desktop when the selection is unchanged", () => {
    const draft = partlySaved([line(1), line(2)]);
    expect(
      reuseDraft({
        draft,
        sentKey: "k",
        key: "other",
        lines: [line(2), line(1)],
        finishLocked: false,
      }),
    ).toBe(true);
  });
});
