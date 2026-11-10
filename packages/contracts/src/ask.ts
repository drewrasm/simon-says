import { z } from "zod";
import { searchResultSchema } from "@simon-says/contracts/search";

export const askTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(2000),
});

/** Recent turns of the browser-held conversation, oldest first. The server
 * keeps nothing between requests; history is sent with each question. */
export const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(askTurnSchema).max(6).default([]),
});

export const askCitationSchema = searchResultSchema
  .pick({ segmentId: true, excerpt: true })
  .extend({
    startMs: searchResultSchema.shape.range.shape.startMs,
    endMs: searchResultSchema.shape.range.shape.endMs,
    timestamp: z.string().regex(/^\d{2,}:\d{2}$/),
  });

/** POST /sessions/:id/ask returns newline-delimited JSON. A sources record
 * precedes text deltas; exactly one done or error record terminates the reply.
 * Content is request-scoped and must never be persisted or sent to telemetry. */
export const askEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sources"),
    citations: z.array(askCitationSchema).max(8),
  }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("done") }),
  z.object({
    type: z.literal("error"),
    message: z.literal("Couldn't answer. Please try again."),
  }),
]);

export type AskTurn = z.infer<typeof askTurnSchema>;
export type AskCitation = z.infer<typeof askCitationSchema>;
export type AskEvent = z.infer<typeof askEventSchema>;
