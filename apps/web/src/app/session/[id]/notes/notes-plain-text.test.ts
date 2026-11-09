import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { describe, expect, it } from "vitest";
import { notesPlainText } from "./notes-plain-text";

const base: BookmarkResponse = {
  id: "0b8f3c52-41f7-4d3a-8f0e-7a1e2c3d4b5f",
  sessionId: "6f1c1f7e-3d0e-4c1e-9a7a-2f5b8c6d9e01",
  revision: 1,
  anchor: { kind: "live", markedAtMs: 804_000 },
  requestedRange: { startMs: 774_000, endMs: 804_000 },
  actualRange: null,
  clockUncertaintyMs: 0,
  completeness: "complete",
  evidence: { segments: [], frames: [] },
  note: null,
  createdAt: "2026-11-09T20:13:24.000Z",
  updatedAt: "2026-11-09T20:13:24.000Z",
};

describe("notesPlainText", () => {
  it("lists cards oldest first as plain lines with no Markdown symbols", () => {
    const text = notesPlainText("Keynote", [
      {
        ...base,
        id: "b",
        note: "Later",
        createdAt: "2026-11-09T20:20:00.000Z",
      },
      {
        ...base,
        id: "a",
        note: "Good *example*",
        evidence: {
          segments: [
            {
              segmentId: "s2",
              revision: 1,
              range: { startMs: 790_000, endMs: 795_000 },
              text: "second",
            },
            {
              segmentId: "s1",
              revision: 1,
              range: { startMs: 780_000, endMs: 785_000 },
              text: "first",
            },
          ],
          frames: [],
        },
      },
    ]);
    expect(text).toBe(
      [
        "My notes: Keynote",
        'Clip · 00:13:24\n"first second"\nGood *example*',
        "Note · 00:13:24\nLater",
      ].join("\n\n"),
    );
  });

  it("keeps Markdown-looking text as written", () => {
    const text = notesPlainText("A # title", [
      { ...base, note: "# not a heading\n[link](x)" },
    ]);
    expect(text).toContain("My notes: A # title");
    expect(text).toContain("# not a heading\n[link](x)");
    expect(text).not.toContain("\\#");
  });

  it("labels an unpinned note with its save time", () => {
    const text = notesPlainText("T", [
      {
        ...base,
        note: "x",
        anchor: { kind: "live", markedAtMs: 0 },
        requestedRange: { startMs: 0, endMs: 0 },
      },
    ]);
    expect(text).toContain("Note · saved 2026-11-09T20:13:24.000Z\nx");
  });

  it("is only the title when there are no cards", () => {
    expect(notesPlainText("Keynote", [])).toBe("My notes: Keynote");
  });
});
