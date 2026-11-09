import "server-only";
import type { IncomingMessage } from "node:http";
import {
  principalCookieName,
  readSessionSecret,
  verifyPrincipal,
} from "../access/credentials";
import { AccessError } from "../access/errors";
import { requireMembership } from "../access/membership";
import {
  DevIngestAuthority,
  type IngestAuthority,
  type HostAuthorization,
} from "./ingest-authority";

/** Node requests have no Next cookies() context. Use the same verifier as readPrincipal. */
function principalId(request: IncomingMessage) {
  const values = (request.headers.cookie ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${principalCookieName}=`));
  if (values.length !== 1) return null;
  let value: string;
  try {
    value = decodeURIComponent(
      values[0]!.slice(principalCookieName.length + 1),
    );
  } catch {
    return null;
  }
  return verifyPrincipal({ value, secret: readSessionSecret() });
}

export class MembershipIngestAuthority implements IngestAuthority {
  // Track 3 exposes no lease API yet. Fencing remains process-local, per session.
  private readonly epochs = new Map<string, number>();

  private async authorize(
    sessionId: string,
    request: IncomingMessage,
    host: boolean,
  ): Promise<HostAuthorization> {
    try {
      const membership = await requireMembership({
        sessionId,
        principalId: principalId(request),
        ...(host ? { role: "host" } : {}),
      });
      if (
        host &&
        !["setup", "live", "degraded"].includes(membership.session.status)
      )
        return "session_ended";
      return true;
    } catch (error) {
      if (error instanceof AccessError) return false;
      throw error;
    }
  }

  authorizeHost(sessionId: string, request: IncomingMessage) {
    return this.authorize(sessionId, request, true);
  }
  authorizeMember(sessionId: string, request: IncomingMessage) {
    return this.authorize(sessionId, request, false).then(
      (result) => result === true,
    );
  }
  checkEpoch(sessionId: string, epoch: number) {
    if (epoch < (this.epochs.get(sessionId) ?? 0)) return false;
    this.epochs.set(sessionId, epoch);
    return true;
  }
}

/** Database configuration always wins over the explicit local-development bypass. */
export function createIngestAuthority(
  env: Readonly<Record<string, string | undefined>>,
): IngestAuthority {
  return env.DATABASE_URL
    ? new MembershipIngestAuthority()
    : new DevIngestAuthority(
        env.CAPTIONS_DEV_SESSION,
        env.NODE_ENV === "production",
      );
}
