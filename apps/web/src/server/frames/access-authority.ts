import "server-only";
import type { IngestAuthority } from "../captions/ingest-authority";
import { devFrameAccess, type HostFrameAccess } from "./upload";

/** Reuse caption membership and its live epoch without letting frames advance it. */
export function createFrameAccess(
  env: Readonly<Record<string, string | undefined>>,
  devOrigin: string,
  authority: IngestAuthority,
): HostFrameAccess {
  if (!env.DATABASE_URL) return devFrameAccess(env, devOrigin);
  const epochs = new Map<string, number>();
  return {
    async authorize(request, sessionId, epoch) {
      const origin = env.NODE_ENV === "production" ? env.APP_ORIGIN : devOrigin;
      if (!origin || request.headers.get("Origin") !== origin)
        return "unauthorized";
      try {
        const allowed = await authority.authorizeHost(sessionId, {
          headers: { cookie: request.headers.get("Cookie") ?? undefined },
        });
        // All membership and lifecycle denials have the same public response.
        if (allowed !== true) return "unauthorized";
      } catch {
        return "unauthorized";
      }
      const captionEpoch = authority.currentEpoch?.(sessionId);
      if (captionEpoch !== undefined)
        return epoch === captionEpoch ? "allowed" : "stale_epoch";
      // Before caption ingest, preserve per-session monotonic fencing locally.
      if (epoch < (epochs.get(sessionId) ?? 0)) return "stale_epoch";
      epochs.set(sessionId, epoch);
      return "allowed";
    },
  };
}
