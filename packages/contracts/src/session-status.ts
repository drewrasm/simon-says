import { z } from "zod";

export const sessionStatusSchema = z.enum([
  "setup",
  "live",
  "degraded",
  "ended",
  "expired",
]);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;
