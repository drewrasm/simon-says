import { describe, expect, it } from "vitest";
import { readRuntimeEnv } from "./env.js";

describe("runtime environment boundary", () => {
  it("allows a provider-free app shell with probes disabled", () => {
    expect(readRuntimeEnv({})).toEqual({ port: 8080, probeToken: undefined });
  });
  it("rejects malformed ports and probe credentials without echoing values", () => {
    for (const PORT of ["0", "65536", "8080junk", "1.5", ""]) {
      expect(() => readRuntimeEnv({ PORT })).toThrow("PORT must be");
    }
    expect(() => readRuntimeEnv({ PROBE_TOKEN: "private value" })).toThrow(
      "PROBE_TOKEN must contain",
    );
  });
});
