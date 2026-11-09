import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { describe, expect, it } from "vitest";
import { momentLabel } from "./notes-entries";
import { notesMarkdown } from "./notes-markdown";

const base: BookmarkResponse = {
  id: "0b8f3c52-41f7-4d3a-8f0e-7a1e2c3d4b5f",
  sessionId: "6f1c1f7e-3d0e-4c1e-9a7a-2f5b8c6d9e01",
  revision: 1,
  anchor: { kind: "live", markedAtMs: 804_000 },
  requestedRange: { startMs: 774_000, endMs: 804_000 },
  actualRange: null,
  clockUncertaintyMs: 0,
  completeness: "complete",
  evidence: { segments: [] },
  note: null,
  createdAt: "2026-11-09T20:13:24.000Z",
  updatedAt: "2026-11-09T20:13:24.000Z",
};

describe("notesMarkdown", () => {
  it("lists notes oldest first with quotes and notes", () => {
    const markdown = notesMarkdown("Keynote", [
      {
        ...base,
        id: "b",
        note: "Later",
        createdAt: "2026-11-09T20:20:00.000Z",
      },
      {
        ...base,
        id: "a",
        note: "Good example",
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
        },
      },
    ]);
    expect(markdown).toBe(
      [
        "# My notes: Keynote",
        "## Clip · 00:13:24",
        "> first second",
        "Good example",
        "## Note · 00:13:24",
        "Later",
      ].join("\n\n") + "\n",
    );
  });

  it("escapes Markdown structure in captured and written text", () => {
    const markdown = notesMarkdown("A # title", [
      { ...base, note: "# not a heading\n[link](x)" },
    ]);
    expect(markdown).toContain("# My notes: A \\# title");
    expect(markdown).toContain("\\# not a heading  \n\\[link\\](x)");
  });

  it("labels an unpinned note with its save time", () => {
    const markdown = notesMarkdown("T", [
      {
        ...base,
        note: "x",
        anchor: { kind: "live", markedAtMs: 0 },
        requestedRange: { startMs: 0, endMs: 0 },
      },
    ]);
    expect(markdown).toContain("## Note · saved 2026-11-09T20:13:24.000Z");
  });
});

describe("momentLabel", () => {
  it("shows a paragraph's range, or one time for a zero-width range", () => {
    const paragraph = (startMs: number, endMs: number): BookmarkResponse => ({
      ...base,
      anchor: {
        kind: "paragraph",
        segmentId: "s",
        segmentRevision: 1,
        range: { startMs, endMs },
      },
      requestedRange: { startMs, endMs },
    });
    expect(momentLabel(paragraph(767_000, 775_000))).toBe(
      "00:12:47 – 00:12:55",
    );
    expect(momentLabel(paragraph(767_000, 767_400))).toBe("00:12:47");
  });
});
