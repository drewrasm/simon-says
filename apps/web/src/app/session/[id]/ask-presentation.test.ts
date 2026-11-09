import { expect, it } from "vitest";
import { askNoteText, askProvenance } from "./ask-presentation";

const first = {
  segmentId: "s1",
  startMs: 724000.9,
  endMs: 738000,
  timestamp: "12:04",
  excerpt: "Synthetic caption",
};
const last = {
  ...first,
  segmentId: "s2",
  startMs: 786000,
  endMs: 798000,
  timestamp: "13:06",
};

it("derives provenance from distinct source lines, independent of retrieval order", () => {
  expect(askProvenance([last, first, first])).toBe(
    "Read 2 lines · 00:12:04 – 00:13:18",
  );
  expect(askProvenance([first])).toBe("Read 1 line · 00:12:04 – 00:12:18");
  expect(askProvenance([])).toBeNull();
});
it("saves the complete answer with its citation destinations through plain-text notes", () => {
  expect(askNoteText("synthetic", "An idea [12:04].", [first])).toBe(
    "An idea [12:04].\n\n00:12:04 — /session/synthetic#t=724000",
  );
  expect(askNoteText("synthetic", "No transcript evidence.", [])).toBe(
    "No transcript evidence.",
  );
});
