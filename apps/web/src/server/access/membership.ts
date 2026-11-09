import "server-only";

import type { MembershipRole } from "@simon-says/contracts/session";
import { z } from "zod";
import { getDatabase } from "./database";
import { AccessError } from "./errors";

export type RequireMembershipOptions = {
  sessionId: string;
  principalId: string | null | undefined;
  role?: MembershipRole;
};

export const requireMembership = async ({
  sessionId,
  principalId,
  role,
}: RequireMembershipOptions) => {
  if (
    !principalId ||
    !z.uuid().safeParse(sessionId).success ||
    !z.uuid().safeParse(principalId).success
  ) {
    throw new AccessError(404, "not_found");
  }

  const membership = await getDatabase().membership.findUnique({
    where: { sessionId_principalId: { sessionId, principalId } },
    include: { session: { omit: { hostLinkTokenHash: true } } },
  });

  if (
    !membership ||
    membership.revokedAt ||
    membership.session.status === "expired" ||
    (role && membership.role !== role)
  ) {
    throw new AccessError(404, "not_found");
  }

  return membership;
};
