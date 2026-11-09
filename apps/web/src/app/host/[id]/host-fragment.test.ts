import { describe, expect, it } from "vitest";
import { readHostToken } from "./host-fragment";

describe("readHostToken", () => {
  it("reads the token from the fragment", () => {
    expect(readHostToken("#token=abc_DEF-123")).toBe("abc_DEF-123");
  });

  it("returns null when there is no token", () => {
    expect(readHostToken("")).toBeNull();
    expect(readHostToken("#")).toBeNull();
    expect(readHostToken("#token=")).toBeNull();
    expect(readHostToken("#other=1")).toBeNull();
  });
});
