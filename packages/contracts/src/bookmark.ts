import { z } from "zod";
import { transcriptSegmentSchema } from "@simon-says/contracts/caption";

const id = transcriptSegmentSchema.shape.sessionId;
const revision = transcriptSegmentSchema.shape.revision;
const ms = z.number().nonnegative();
const note = z.string().max(4_000);

export const sourceRangeSchema = z
  .object({ startMs: ms, endMs: ms })
  .refine((range) => range.endMs >= range.startMs, {
    message: "endMs must not precede startMs",
    path: ["endMs"],
  });

export const bookmarkAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("live"), markedAtMs: ms }),
  z.object({
    kind: z.literal("paragraph"),
    segmentId: transcriptSegmentSchema.shape.segmentId,
    segmentRevision: revision,
    range: sourceRangeSchema,
  }),
]);

export const putBookmarkRequestSchema = z.object({
  sessionId: id,
  operationId: z.uuid(),
  expectedRevision: revision.nullable(),
  anchor: bookmarkAnchorSchema,
  note: note.optional(),
});

export const bookmarkSegmentEvidenceSchema = z.object({
  segmentId: transcriptSegmentSchema.shape.segmentId,
  revision,
  range: sourceRangeSchema,
  text: transcriptSegmentSchema.shape.text,
});

export const bookmarkFrameEvidenceSchema = z.object({
  frameId: id,
  capturedAtMs: ms,
  imageUrl: z.url({ protocol: /^https?$/ }).nullable(),
});

export const bookmarkResponseSchema = z.object({
  id: z.uuid(),
  sessionId: id,
  revision,
  anchor: bookmarkAnchorSchema,
  requestedRange: sourceRangeSchema,
  actualRange: sourceRangeSchema.nullable(),
  clockUncertaintyMs: ms,
  completeness: z.enum(["pending", "complete", "incomplete"]),
  evidence: z.object({
    segments: z.array(bookmarkSegmentEvidenceSchema),
    frames: z.array(bookmarkFrameEvidenceSchema),
  }),
  note: note.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const listBookmarksResponseSchema = z.object({
  bookmarks: z.array(bookmarkResponseSchema),
});

export const revisionConflictErrorSchema = z.object({
  error: z.literal("revision_conflict"),
  id: z.uuid(),
  expectedRevision: revision.nullable(),
  currentRevision: revision.nullable(),
});

export type SourceRange = z.infer<typeof sourceRangeSchema>;
export type BookmarkAnchor = z.infer<typeof bookmarkAnchorSchema>;
export type PutBookmarkRequest = z.infer<typeof putBookmarkRequestSchema>;
export type BookmarkSegmentEvidence = z.infer<
  typeof bookmarkSegmentEvidenceSchema
>;
export type BookmarkFrameEvidence = z.infer<typeof bookmarkFrameEvidenceSchema>;
export type BookmarkResponse = z.infer<typeof bookmarkResponseSchema>;
export type ListBookmarksResponse = z.infer<typeof listBookmarksResponseSchema>;
export type RevisionConflictError = z.infer<typeof revisionConflictErrorSchema>;
