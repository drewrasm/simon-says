import { describe, expect, it } from "vitest";
import {
  createSessionClock,
  formatTalkTime,
  sessionElapsedMs,
} from "./talk-time";

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

describe("createSessionClock", () => {
  it("advances from the server's elapsed time by monotonic time", () => {
    let monotonic = 1_000;
    const clock = createSessionClock(60_000, () => monotonic);
    expect(clock()).toBe(60_000);
    monotonic += 2_500;
    expect(clock()).toBe(62_500);
  });
});

describe("sessionElapsedMs", () => {
  const createdAt = new Date("2026-11-09T20:00:00Z");

  it("measures from session creation and never goes negative", () => {
    expect(sessionElapsedMs(createdAt, createdAt.getTime() + 1_500)).toBe(
      1_500,
    );
    expect(sessionElapsedMs(createdAt, createdAt.getTime() - 1)).toBe(0);
  });
});
