import { z } from "zod";
import { sourceRangeSchema } from "@simon-says/contracts/bookmark";
import { transcriptSegmentSchema } from "@simon-says/contracts/caption";

export const maxRecapBookmarks = 50;

export const createRecapRequestSchema = z.object({
  operationId: z.uuid(),
  bookmarks: z
    .array(
      z.object({
        bookmarkId: z.uuid(),
        expectedRevision: transcriptSegmentSchema.shape.revision,
      }),
    )
    .min(1)
    .max(maxRecapBookmarks),
});

export const createRecapResponseSchema = z.object({ id: z.uuid() });

export const recapCitationSchema = z.object({
  bookmarkId: z.uuid(),
  segmentId: transcriptSegmentSchema.shape.segmentId,
  segmentRevision: transcriptSegmentSchema.shape.revision,
  range: sourceRangeSchema,
  excerpt: transcriptSegmentSchema.shape.text,
});

export const recapTakeawaySchema = z.object({
  text: z.string().min(1),
  citations: z.array(recapCitationSchema).min(1),
});

export const recapResponseSchema = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "running", "ready", "failed", "stale"]),
  takeaways: z.array(recapTakeawaySchema),
  failureReason: z.string().min(1).nullable(),
});

export const recapExportFormatSchema = z.literal("markdown");

export type CreateRecapRequest = z.infer<typeof createRecapRequestSchema>;
export type CreateRecapResponse = z.infer<typeof createRecapResponseSchema>;
export type RecapCitation = z.infer<typeof recapCitationSchema>;
export type RecapTakeaway = z.infer<typeof recapTakeawaySchema>;
export type RecapResponse = z.infer<typeof recapResponseSchema>;
export type RecapExportFormat = z.infer<typeof recapExportFormatSchema>;
