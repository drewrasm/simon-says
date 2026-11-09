import "server-only";

import {
  createSessionRequestSchema,
  joinSessionRequestSchema,
} from "@simon-says/contracts/session";
import { z } from "zod";
import { requiresSecureCookie } from "./credentials";
import { AccessError } from "./errors";
import { ensurePrincipal } from "./principal";
import { claimHost, createSession, joinSession } from "./sessions";

const respond = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const handleAccess = async (
  operation: () => Promise<unknown>,
  status = 200,
) => {
  try {
    return respond(await operation(), status);
  } catch (error) {
    if (error instanceof AccessError) {
      return respond({ error: error.code }, error.status);
    }
    return respond({ error: "internal_error" }, 500);
  }
};

const parseBody = async <T>(request: Request, schema: z.ZodType<T>) => {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  ) {
    throw new AccessError(400, "invalid_request");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AccessError(400, "invalid_request");
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new AccessError(400, "invalid_request");
  return result.data;
};

export const handleCreateSession = (request: Request) =>
  handleAccess(async () => {
    const body = await parseBody(request, createSessionRequestSchema);
    const principal = await ensurePrincipal({
      secureCookie: requiresSecureCookie(request.url),
    });
    return createSession({ principalId: principal.id, request: body });
  }, 201);

export const handleJoinSession = (request: Request) =>
  handleAccess(async () => {
    const body = await parseBody(request, joinSessionRequestSchema);
    const principal = await ensurePrincipal({
      secureCookie: requiresSecureCookie(request.url),
    });
    return joinSession({
      principalId: principal.id,
      inviteCode: body.inviteCode,
    });
  });

const hostClaimRequestSchema = z.object({ token: z.string().min(1).max(256) });

export const handleClaimHost = (request: Request, sessionId: string) =>
  handleAccess(async () => {
    if (!z.uuid().safeParse(sessionId).success) {
      throw new AccessError(404, "not_found");
    }
    const body = await parseBody(request, hostClaimRequestSchema);
    const principal = await ensurePrincipal({
      secureCookie: requiresSecureCookie(request.url),
    });
    return claimHost({
      principalId: principal.id,
      sessionId,
      token: body.token,
    });
  });
