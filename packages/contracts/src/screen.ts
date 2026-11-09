import { z } from "zod";

export const screenIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+$/);
const uint = z.number().int().min(0).max(0xffff_ffff);
export const frameUploadMetadataSchema = z.strictObject({
  epoch: uint.min(1),
  seq: uint,
  captureSampleOffset: uint,
  width: z.number().int().min(1).max(1600),
  height: z.number().int().min(1).max(16_000),
  mimeType: z.enum(["image/webp", "image/jpeg"]),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  captureState: z.enum(["live", "stopped"]),
});

/** Shared source metadata. No private selection data or signed URLs. */
export const screenObservationSchema = frameUploadMetadataSchema.extend({
  sessionId: screenIdSchema,
  observationId: screenIdSchema,
  frameId: screenIdSchema,
  captureMs: z.number().nonnegative(),
  objectKey: z.string().min(1).max(1024),
  glossaryTerms: z.array(z.string().max(200)).max(100),
  expiresAt: z.iso.datetime().nullable(),
});
export type FrameUploadMetadata = z.infer<typeof frameUploadMetadataSchema>;
export type ScreenObservation = z.infer<typeof screenObservationSchema>;

export function observationDocumentId(observation: ScreenObservation): string {
  const { sessionId, epoch, observationId } =
    screenObservationSchema.parse(observation);
  return `${sessionId}:${epoch}:${observationId}`;
}
