import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canAddNote,
  isClip,
  momentHref,
  newestFirst,
  NotesList,
} from "./notes-list";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const note = (overrides: Partial<BookmarkResponse> = {}): BookmarkResponse => ({
  id: "0b8f3c52-41f7-4d3a-8f0e-7a1e2c3d4b5f",
  sessionId: "6f1c1f7e-3d0e-4c1e-9a7a-2f5b8c6d9e01",
  revision: 1,
  anchor: { kind: "live", markedAtMs: 804_000 },
  requestedRange: { startMs: 774_000, endMs: 804_000 },
  actualRange: null,
  clockUncertaintyMs: 5_000,
  completeness: "pending",
  evidence: { segments: [], frames: [] },
  note: "Check the mics in our own venue.",
  createdAt: "2026-11-09T20:13:24.000Z",
  updatedAt: "2026-11-09T20:13:24.000Z",
  ...overrides,
});

describe("notes list", () => {
  it("shows a note pinned to its talk time", () => {
    const html = renderToStaticMarkup(<NotesList bookmarks={[note()]} />);
    expect(html).toContain("Note · 00:13:24");
    expect(html).toContain("Check the mics in our own venue.");
    expect(html).toContain("All 1");
    expect(html).toContain("Notes 1");
    expect(html).toContain("Clips 0");
  });

  it("shows an unpinned note's save time instead of a talk time", () => {
    const html = renderToStaticMarkup(
      <NotesList
        bookmarks={[
          note({
            anchor: { kind: "live", markedAtMs: 0 },
            requestedRange: { startMs: 0, endMs: 0 },
          }),
        ]}
      />,
    );
    expect(html).toContain('<time dateTime="2026-11-09T20:13:24.000Z">');
    expect(html).not.toContain("00:00:00");
  });

  it("shows a clip with its quoted captions", () => {
    const html = renderToStaticMarkup(
      <NotesList
        bookmarks={[
          note({
            evidence: {
              segments: [
                {
                  segmentId: "seg-1",
                  revision: 1,
                  range: { startMs: 800_000, endMs: 804_000 },
                  text: "They missed about half of it.",
                },
              ],
              frames: [],
            },
          }),
        ]}
      />,
    );
    expect(html).toContain("Clips 1");
    expect(html).toContain("“They missed about half of it.”");
  });

  it("shows an empty state when nothing is saved", () => {
    const html = renderToStaticMarkup(<NotesList bookmarks={[]} />);
    expect(html).toContain("Nothing saved yet");
    expect(html).toContain("Clip last 30s");
  });

  it("offers removing a card and adding a note to a clip without one", () => {
    const html = renderToStaticMarkup(
      <NotesList
        bookmarks={[
          note({
            note: null,
            anchor: {
              kind: "paragraph",
              segmentId: "seg-1",
              segmentRevision: 1,
              range: { startMs: 767_000, endMs: 775_000 },
            },
            requestedRange: { startMs: 767_000, endMs: 775_000 },
          }),
        ]}
      />,
    );
    expect(html).toContain('aria-label="Remove clip"');
    expect(html).toContain("Add a note");
    expect(html).toContain("00:12:47 – 00:12:55");
    expect(html).toContain("Waiting for the captions from this moment");
  });

  it("shows a Keep that clip as pending until its captions resolve", () => {
    const html = renderToStaticMarkup(
      <NotesList bookmarks={[note({ note: null })]} />,
    );
    expect(html).toContain("Clips 1");
    expect(html).toContain("00:13:24");
    expect(html).toContain("Waiting for the captions");
  });

  it("says when part of a moment was not captioned", () => {
    const html = renderToStaticMarkup(
      <NotesList
        bookmarks={[
          note({
            completeness: "incomplete",
            evidence: {
              segments: [
                {
                  segmentId: "seg-1",
                  revision: 1,
                  range: { startMs: 800_000, endMs: 804_000 },
                  text: "Half of it.",
                },
              ],
              frames: [],
            },
          }),
        ]}
      />,
    );
    expect(html).toContain("wasn&#x27;t captioned");
  });

  it("shows an aligned frame only when the API returns its URL", () => {
    const withFrame = (imageUrl: string | null) =>
      renderToStaticMarkup(
        <NotesList
          bookmarks={[
            note({
              evidence: {
                segments: [],
                frames: [
                  {
                    frameId: "frame-1",
                    capturedAtMs: 800_000,
                    imageUrl,
                  },
                ],
              },
            }),
          ]}
        />,
      );
    expect(withFrame(null)).not.toContain("<img");
    expect(withFrame("https://example.test/f.png")).toContain(
      'src="https://example.test/f.png"',
    );
  });

  it("links pinned cards back to their moment only when asked", () => {
    const pinned = note();
    expect(
      renderToStaticMarkup(<NotesList bookmarks={[pinned]} showJump />),
    ).toContain(`href="${momentHref(pinned)}"`);
    expect(
      renderToStaticMarkup(<NotesList bookmarks={[pinned]} />),
    ).not.toContain("Jump to this moment");
    const unpinned = note({
      anchor: { kind: "live", markedAtMs: 0 },
      requestedRange: { startMs: 0, endMs: 0 },
    });
    expect(
      renderToStaticMarkup(<NotesList bookmarks={[unpinned]} showJump />),
    ).not.toContain("Jump to this moment");
  });

  it("renders note text as text, not markup", () => {
    const html = renderToStaticMarkup(
      <NotesList
        bookmarks={[note({ note: "<img src=x onerror=alert(1)>" })]}
      />,
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("isClip", () => {
  it("treats an unpinned note as a note, never a clip", () => {
    expect(
      isClip(
        note({
          anchor: { kind: "live", markedAtMs: 0 },
          requestedRange: { startMs: 0, endMs: 0 },
        }),
      ),
    ).toBe(false);
  });
});

describe("canAddNote", () => {
  it("waits for a pending Keep that mark's captions before offering a note", () => {
    const pending = note({
      note: null,
      anchor: { kind: "live", markedAtMs: 60_000 },
      requestedRange: { startMs: 30_000, endMs: 60_000 },
    });
    expect(isClip(pending)).toBe(true);
    expect(canAddNote(pending)).toBe(false);
  });

  it("offers a note on a paragraph clip without one", () => {
    expect(
      canAddNote(
        note({
          note: null,
          anchor: {
            kind: "paragraph",
            segmentId: "seg-1",
            segmentRevision: 1,
            range: { startMs: 5_000, endMs: 10_000 },
          },
        }),
      ),
    ).toBe(true);
  });
});

describe("newestFirst", () => {
  it("orders by creation time, newest first, without mutating input", () => {
    const older = note({ id: "a", createdAt: "2026-11-09T20:00:00.000Z" });
    const newer = note({ id: "b", createdAt: "2026-11-09T20:05:00.000Z" });
    const input = [older, newer];
    expect(newestFirst(input).map(({ id }) => id)).toEqual(["b", "a"]);
    expect(input.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("renders the newest note first", () => {
    const html = renderToStaticMarkup(
      <NotesList
        bookmarks={[
          note({
            id: "a",
            note: "First thought",
            createdAt: "2026-11-09T20:00:00.000Z",
          }),
          note({
            id: "b",
            note: "Second thought",
            createdAt: "2026-11-09T20:05:00.000Z",
          }),
        ]}
      />,
    );
    expect(html.indexOf("Second thought")).toBeLessThan(
      html.indexOf("First thought"),
    );
  });
});
