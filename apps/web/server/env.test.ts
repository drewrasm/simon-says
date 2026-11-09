import { describe, expect, it } from "vitest";
import { readRuntimeEnv } from "./env.js";

describe("runtime environment boundary", () => {
  it("allows a provider-free app shell with probes disabled", () => {
    expect(readRuntimeEnv({})).toMatchObject({
      port: 8080,
      probeToken: undefined,
    });
  });
  it("rejects malformed ports and probe credentials without echoing values", () => {
    for (const PORT of ["0", "65536", "8080junk", "1.5", ""]) {
      expect(() => readRuntimeEnv({ PORT })).toThrow("PORT must be");
    }
    expect(() => readRuntimeEnv({ PROBE_TOKEN: "private value" })).toThrow(
      "PROBE_TOKEN must contain",
    );
  });
  it("validates development session IDs at boot using the caption ID alphabet", () => {
    expect(
      readRuntimeEnv({ CAPTIONS_DEV_SESSION: "dev.session_1-test" })
        .captionsDevSession,
    ).toBe("dev.session_1-test");
    for (const value of [
      "",
      "dev:session",
      "dev/session",
      "dev session",
      "x".repeat(201),
    ]) {
      expect(() => readRuntimeEnv({ CAPTIONS_DEV_SESSION: value })).toThrow(
        "CAPTIONS_DEV_SESSION is invalid.",
      );
    }
  });
});

it("validates the bounded caption reconnect grace", () => {
  expect(readRuntimeEnv({}).captionReconnectGraceMs).toBe(10000);
  expect(
    readRuntimeEnv({ CAPTION_RECONNECT_GRACE_MS: "0" }).captionReconnectGraceMs,
  ).toBe(0);
  for (const value of ["-1", "60001", "NaN", "1.5"])
    expect(() => readRuntimeEnv({ CAPTION_RECONNECT_GRACE_MS: value })).toThrow(
      "CAPTION_RECONNECT_GRACE_MS",
    );
});
