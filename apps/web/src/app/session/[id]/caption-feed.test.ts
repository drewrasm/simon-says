import type { CaptionEvent } from "@simon-says/contracts/caption";
import { describe, expect, it } from "vitest";
import {
  applyCaptionEvent,
  hashTarget,
  emptyCaptionFeed,
  formatSourceTime,
  type CaptionFeed,
} from "./caption-feed";

const base = { sessionId: "s1", epoch: 1 };

const interim = (cursor: string, windowId: string, text: string, startMs = 0) =>
  ({
    ...base,
    cursor,
    kind: "caption.interim",
    windowId,
    text,
    startMs,
    estimatedEndMs: startMs + 1_000,
  }) satisfies CaptionEvent;

const final = (
  cursor: string,
  windowId: string,
  segments: { id: string; revision?: number; startMs: number; text: string }[],
) =>
  ({
    ...base,
    cursor,
    kind: "caption.final",
    windowId,
    segments: segments.map((segment) => ({
      ...base,
      windowId,
      segmentId: segment.id,
      revision: segment.revision ?? 1,
      startMs: segment.startMs,
      endMs: segment.startMs + 2_000,
      timing: { kind: "estimated", uncertaintyMs: 250 },
      text: segment.text,
      provenance: "live",
    })),
  }) satisfies CaptionEvent;

const fold = (events: CaptionEvent[]): CaptionFeed =>
  events.reduce(applyCaptionEvent, emptyCaptionFeed);

describe("caption feed", () => {
  it("replaces interim text per window and clears it on that window's final", () => {
    const feed = fold([
      interim("1", "w1", "hello"),
      interim("2", "w1", "hello there"),
      interim("3", "w2", "next", 5_000),
    ]);
    expect(feed.interim.map((entry) => entry.text)).toEqual([
      "hello there",
      "next",
    ]);

    const after = applyCaptionEvent(
      feed,
      final("4", "w1", [{ id: "a", startMs: 0, text: "Hello there." }]),
    );
    expect(after.interim.map((entry) => entry.windowId)).toEqual(["w2"]);
    expect(after.lines).toMatchObject([
      { kind: "final", text: "Hello there." },
    ]);
    expect(after.sourceMs).toBe(6_000);
  });

  it("keeps the highest revision and ignores replayed finals", () => {
    const first = final("1", "w1", [
      { id: "b", startMs: 3_000, text: "second" },
      { id: "a", startMs: 0, text: "first" },
    ]);
    const corrected = final("2", "w1", [
      { id: "a", revision: 2, startMs: 0, text: "First, corrected" },
    ]);
    const feed = fold([first, corrected, first, corrected]);
    expect(
      feed.lines.map((line) => line.kind === "final" && line.text),
    ).toEqual(["First, corrected", "second"]);
  });

  it("keeps a line removed by an empty revision removed when an older one replays", () => {
    const first = final("1", "w1", [{ id: "a", startMs: 0, text: "x" }]);
    const emptied = final("2", "w1", [
      { id: "a", revision: 2, startMs: 0, text: "" },
    ]);
    expect(fold([first, emptied, first]).lines).toEqual([]);
  });

  it("orders gaps on the source clock and drops interim text when the session ends", () => {
    const gap = {
      ...base,
      cursor: "3",
      kind: "caption.gap",
      startMs: 1_000,
      endMs: 2_500,
      reason: "audio_missing",
    } satisfies CaptionEvent;
    const feed = fold([
      final("1", "w1", [{ id: "b", startMs: 3_000, text: "later" }]),
      interim("2", "w2", "still talking", 6_000),
      gap,
      gap,
      {
        ...base,
        cursor: "4",
        kind: "capture.state",
        session: "ended",
        audio: "stopped",
        captionLagMs: null,
      },
    ]);
    expect(feed.lines.map((line) => line.kind)).toEqual(["gap", "final"]);
    expect(feed.interim).toEqual([]);
    expect(feed.capture?.session).toBe("ended");
  });

  it("waits to resolve a #t= link until the feed covers that moment", () => {
    const line = (startMs: number) => ({ startMs, endMs: startMs + 4_000 });
    expect(hashTarget([line(0)], 600_000)).toBeNull();
    expect(hashTarget([line(0), line(598_000)], 600_000)).toEqual(
      line(598_000),
    );
    expect(
      hashTarget([line(0), line(590_000), line(605_000)], 600_000),
    ).toEqual(line(590_000));
  });

  it("formats session-clock times", () => {
    expect(formatSourceTime(0)).toBe("00:00:00");
    expect(formatSourceTime(3_723_900)).toBe("01:02:03");
  });
});
