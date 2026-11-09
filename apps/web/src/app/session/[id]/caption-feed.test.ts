import type { CaptionEvent } from "@simon-says/contracts/caption";
import { describe, expect, it } from "vitest";
import {
  applyCaptionEvent,
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

  it("formats session-clock times", () => {
    expect(formatSourceTime(0)).toBe("00:00:00");
    expect(formatSourceTime(3_723_900)).toBe("01:02:03");
  });
});
