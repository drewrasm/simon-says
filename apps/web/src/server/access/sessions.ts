import "server-only";

import {
  createSessionResponseSchema,
  joinSessionResponseSchema,
  type CreateSessionRequest,
  type JoinSessionRequest,
} from "@simon-says/contracts/session";
import {
  createJoinCode,
  createToken,
  hashToken,
  verifyHostToken,
} from "./credentials";
import { getDatabase } from "./database";
import { AccessError } from "./errors";

export type CreateSessionOptions = {
  principalId: string;
  request: CreateSessionRequest;
};

const maxCreateAttempts = 5;

const uniqueConflict = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "P2002";

export const createSession = async ({
  principalId,
  request,
}: CreateSessionOptions) => {
  for (let attempt = 1; ; attempt++) {
    const token = createToken();
    const inviteCode = createToken();
    const joinCode = createJoinCode();

    try {
      const session = await getDatabase().$transaction(async (database) =>
        database.session.create({
          data: {
            ...(request.title === undefined ? {} : { title: request.title }),
            hostPrincipalId: principalId,
            hostLinkTokenHash: hashToken(token),
            inviteCode,
            joinCode,
            memberships: { create: { principalId, role: "host" } },
          },
        }),
      );

      return createSessionResponseSchema.parse({
        sessionId: session.id,
        hostPath: `/host/${session.id}#token=${token}`,
        inviteCode,
        joinPath: `/join/${inviteCode}`,
        joinCode,
      });
    } catch (error) {
      // Join codes are short enough to collide; every credential is regenerated on retry.
      if (!uniqueConflict(error) || attempt === maxCreateAttempts) throw error;
    }
  }
};

type AdmitMembershipOptions = {
  principalId: string;
} & (
  | ({ role: "attendee" } & JoinSessionRequest)
  | { role: "host"; sessionId: string; token: string }
);

const findAdmissionTarget = (options: AdmitMembershipOptions) => {
  if (options.role === "host") return { id: options.sessionId };
  return "joinCode" in options
    ? { joinCode: options.joinCode }
    : { inviteCode: options.inviteCode };
};

const admitMembership = async (options: AdmitMembershipOptions) =>
  getDatabase().$transaction(async (database) => {
    const session = await database.session.findUnique({
      where: findAdmissionTarget(options),
    });

    if (
      !session ||
      session.status === "ended" ||
      session.status === "expired" ||
      session.endedAt ||
      (options.role === "host" &&
        !verifyHostToken({
          token: options.token,
          tokenHash: session.hostLinkTokenHash,
        }))
    ) {
      throw new AccessError(404, "not_found");
    }

    const membership = await database.membership.upsert({
      where: {
        sessionId_principalId: {
          sessionId: session.id,
          principalId: options.principalId,
        },
      },
      create: {
        sessionId: session.id,
        principalId: options.principalId,
        role: options.role,
      },
      update: options.role === "host" ? { role: "host" } : {},
    });

    if (membership.revokedAt) throw new AccessError(404, "not_found");
    if (options.role === "attendee" && membership.role === "host") {
      throw new AccessError(409, "already_host");
    }

    return membership;
  });

export type JoinSessionOptions = { principalId: string } & JoinSessionRequest;

export const joinSession = async (options: JoinSessionOptions) => {
  const membership = await admitMembership({ ...options, role: "attendee" });
  return joinSessionResponseSchema.parse({
    sessionId: membership.sessionId,
    membershipId: membership.id,
    role: membership.role,
  });
};

export type ClaimHostOptions = {
  principalId: string;
  sessionId: string;
  token: string;
};

export const claimHost = async (options: ClaimHostOptions) => {
  const membership = await admitMembership({ ...options, role: "host" });
  return {
    sessionId: membership.sessionId,
    membershipId: membership.id,
    role: membership.role,
  };
};
