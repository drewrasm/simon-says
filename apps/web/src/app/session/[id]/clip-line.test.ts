import { describe, expect, it } from "vitest";
import {
  clipLabel,
  clipQuote,
  extendSelection,
  lastLine,
  latestTalkMs,
  paragraphAnchor,
  selectedLines,
  type ClipLine,
} from "./clip-line";

const line = (n: number, startMs: number, endMs: number): ClipLine => ({
  segmentId: `seg-${n}`,
  revision: 1,
  startMs,
  endMs,
  text: `Line ${n}.`,
});

const lines = [
  line(3, 775_000, 786_000),
  line(1, 758_000, 767_000),
  line(2, 767_000, 775_000),
];

describe("clip lines", () => {
  it("orders a selection as spoken and labels its range", () => {
    const selection = selectedLines(lines, ["seg-3", "seg-2"]);
    expect(selection.map(({ segmentId }) => segmentId)).toEqual([
      "seg-2",
      "seg-3",
    ]);
    expect(clipLabel(selection)).toBe("2 lines · 00:12:47 – 00:13:06");
    expect(clipQuote(selection)).toBe("Line 2. Line 3.");
  });

  it("extends a selection by one neighbouring line", () => {
    expect(extendSelection(lines, ["seg-2"], "before")).toEqual([
      "seg-2",
      "seg-1",
    ]);
    expect(extendSelection(lines, ["seg-2"], "after")).toEqual([
      "seg-2",
      "seg-3",
    ]);
    expect(extendSelection(lines, ["seg-3"], "after")).toEqual(["seg-3"]);
    expect(extendSelection(lines, [], "after")).toEqual([]);
  });

  it("knows where captions have reached, or that they have not started", () => {
    expect(latestTalkMs(lines)).toBe(786_000);
    expect(latestTalkMs([])).toBeNull();
    expect(lastLine(lines)?.segmentId).toBe("seg-3");
    expect(lastLine([])).toBeNull();
  });

  it("anchors a line to its exact source range", () => {
    expect(paragraphAnchor(line(2, 767_000, 775_000))).toEqual({
      kind: "paragraph",
      segmentId: "seg-2",
      segmentRevision: 1,
      range: { startMs: 767_000, endMs: 775_000 },
    });
  });
});
