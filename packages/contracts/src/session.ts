import { z } from "zod";
import { transcriptSegmentSchema } from "@simon-says/contracts/caption";

const id = transcriptSegmentSchema.shape.sessionId;
const path = z.string().regex(/^\/(?!\/)/);
const inviteCode = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const membershipRoleSchema = z.enum(["host", "attendee"]);

export const createSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const createSessionResponseSchema = z.object({
  sessionId: id,
  hostPath: path,
  inviteCode,
  joinPath: path,
});

export const joinSessionRequestSchema = z.object({ inviteCode });

export const joinSessionResponseSchema = z.object({
  sessionId: id,
  membershipId: z.uuid(),
  role: z.literal("attendee"),
});

export const membershipSchema = z.object({
  sessionId: id,
  principalId: z.uuid(),
  role: membershipRoleSchema,
});

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
export type JoinSessionRequest = z.infer<typeof joinSessionRequestSchema>;
export type JoinSessionResponse = z.infer<typeof joinSessionResponseSchema>;
export type Membership = z.infer<typeof membershipSchema>;
