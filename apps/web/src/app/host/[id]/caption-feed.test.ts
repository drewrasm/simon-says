import type { CaptionEvent } from "@simon-says/contracts/caption";
import { describe, expect, it } from "vitest";
import {
  applyCaptionEvent,
  emptyFeed,
  feedLines,
  formatClock,
} from "./caption-feed";

const base = { sessionId: "s1", epoch: 1, windowId: "w1" } as const;
const segment = (
  segmentId: string,
  revision: number,
  startMs: number,
  text: string,
) => ({
  ...base,
  segmentId,
  revision,
  startMs,
  endMs: startMs + 1000,
  timing: { kind: "estimated" as const, uncertaintyMs: 100 },
  text,
  provenance: "live" as const,
});

const fold = (events: CaptionEvent[]) =>
  events.reduce(applyCaptionEvent, emptyFeed);

describe("caption feed", () => {
  it("shows interim text, then replaces it with the window's final", () => {
    const interim = fold([
      {
        kind: "caption.interim",
        cursor: "1",
        ...base,
        text: "hello wor",
        startMs: 0,
        estimatedEndMs: 900,
      },
    ]);
    expect(feedLines(interim)).toMatchObject([
      { kind: "interim", text: "hello wor" },
    ]);

    const final = applyCaptionEvent(interim, {
      kind: "caption.final",
      cursor: "2",
      ...base,
      segments: [segment("a", 1, 0, "Hello world.")],
    });
    expect(feedLines(final)).toMatchObject([
      { kind: "final", text: "Hello world." },
    ]);
  });

  it("keeps the highest revision when replays resend older finals", () => {
    const feed = fold([
      {
        kind: "caption.final",
        cursor: "2",
        ...base,
        segments: [segment("a", 2, 0, "Fixed.")],
      },
      {
        kind: "caption.final",
        cursor: "1",
        ...base,
        segments: [segment("a", 1, 0, "Fix.")],
      },
    ]);
    expect(feedLines(feed).map((line) => line.text)).toEqual(["Fixed."]);
  });

  it("orders finals and gaps by source time", () => {
    const feed = fold([
      {
        kind: "caption.final",
        cursor: "1",
        ...base,
        segments: [segment("b", 1, 5000, "Later.")],
      },
      {
        kind: "caption.gap",
        cursor: "2",
        sessionId: "s1",
        epoch: 1,
        startMs: 1000,
        endMs: 4000,
        reason: "audio_missing",
      },
      {
        kind: "caption.final",
        cursor: "3",
        ...base,
        segments: [segment("a", 1, 0, "First.")],
      },
    ]);
    expect(feedLines(feed).map((line) => line.kind)).toEqual([
      "final",
      "gap",
      "final",
    ]);
  });

  it("keeps a later Go live after earlier captions though its clock restarts", () => {
    const second = { ...base, epoch: 2, windowId: "w2" } as const;
    const feed = fold([
      {
        kind: "caption.final",
        cursor: "1",
        ...base,
        segments: [
          segment("a", 1, 0, "First take, start."),
          segment("b", 1, 8000, "First take, end."),
        ],
      },
      {
        kind: "caption.final",
        cursor: "2",
        ...second,
        segments: [{ ...segment("c", 1, 2000, "Second take."), ...second }],
      },
      {
        kind: "caption.interim",
        cursor: "3",
        ...second,
        windowId: "w3",
        text: "still talking",
        startMs: 4000,
        estimatedEndMs: 5000,
      },
    ]);
    expect(feedLines(feed).map((line) => line.text)).toEqual([
      "First take, start.",
      "First take, end.",
      "Second take.",
      "still talking",
    ]);
  });

  it("formats the session clock", () => {
    expect(formatClock(0)).toBe("00:00:00");
    expect(formatClock(3_725_400)).toBe("01:02:05");
  });
});
