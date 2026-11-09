import { describe, expect, it } from "vitest";
import { formatTalkTime, isUnpinned, UNPINNED_MARK_MS } from "./talk-time";

describe("formatTalkTime", () => {
  it("pads hours, minutes, and seconds", () => {
    expect(formatTalkTime(0)).toBe("00:00:00");
    expect(formatTalkTime(13 * 60_000 + 24_999)).toBe("00:13:24");
    expect(formatTalkTime(2 * 3_600_000 + 5_000)).toBe("02:00:05");
  });

  it("clamps negative times to zero", () => {
    expect(formatTalkTime(-500)).toBe("00:00:00");
  });
});

describe("isUnpinned", () => {
  it("is true for a live note saved with the unpinned mark", () => {
    expect(
      isUnpinned({
        anchor: { kind: "live", markedAtMs: UNPINNED_MARK_MS },
        requestedRange: { startMs: 0, endMs: 0 },
      }),
    ).toBe(true);
  });

  it("is false for a pinned live mark or a paragraph range", () => {
    expect(
      isUnpinned({
        anchor: { kind: "live", markedAtMs: 804_000 },
        requestedRange: { startMs: 774_000, endMs: 804_000 },
      }),
    ).toBe(false);
    expect(
      isUnpinned({
        anchor: { kind: "paragraph" },
        requestedRange: { startMs: 5_000, endMs: 5_000 },
      }),
    ).toBe(false);
  });
});
