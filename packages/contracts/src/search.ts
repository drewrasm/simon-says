import { z } from "zod";
import { sourceRangeSchema } from "@simon-says/contracts/bookmark";
import { transcriptSegmentSchema } from "@simon-says/contracts/caption";

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(20).default(10),
  cursor: z.string().min(1).max(200).optional(),
});

export const searchResultSchema = z.object({
  passageId: z.string().min(1),
  segmentId: transcriptSegmentSchema.shape.segmentId,
  segmentRevision: transcriptSegmentSchema.shape.revision,
  range: sourceRangeSchema,
  excerpt: transcriptSegmentSchema.shape.text,
});

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  nextCursor: z.string().min(1).max(200).nullable(),
  indexingState: z.enum(["current", "catching_up", "unavailable"]),
});

export type SearchRequest = z.input<typeof searchRequestSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
