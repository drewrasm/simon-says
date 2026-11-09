import { describe, expect, it } from "vitest";
import {
  frameUploadMetadataSchema,
  screenObservationSchema,
  observationDocumentId,
} from "./screen";
const metadata = {
  epoch: 1,
  seq: 0,
  captureSampleOffset: 24000,
  width: 1600,
  height: 900,
  mimeType: "image/webp",
  checksum: "a".repeat(64),
  captureState: "live",
};
describe("screen contracts", () => {
  it("validates metadata and rejects unsupported or unbounded values", () => {
    expect(frameUploadMetadataSchema.parse(metadata)).toEqual(metadata);
    for (const patch of [
      { epoch: 0 },
      { seq: -1 },
      { captureSampleOffset: 1.5 },
      { width: 1601 },
      { height: 0 },
      { mimeType: "image/png" },
      { checksum: "A".repeat(64) },
      { captureState: "unknown" },
      { extra: 1 },
    ])
      expect(
        frameUploadMetadataSchema.safeParse({ ...metadata, ...patch }).success,
      ).toBe(false);
  });
  it("composes collision-safe observation IDs", () => {
    const observation = screenObservationSchema.parse({
      ...metadata,
      sessionId: "session-1",
      observationId: "frame_0",
      frameId: "frame_0",
      captureMs: 1000,
      objectKey: "sessions/session-1/frame.webp",
      glossaryTerms: [],
      expiresAt: null,
    });
    expect(observationDocumentId(observation)).toBe("session-1:1:frame_0");
    expect(() =>
      observationDocumentId({ ...observation, sessionId: "bad:id" }),
    ).toThrow();
  });
});
