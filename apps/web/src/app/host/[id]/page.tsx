import type { Metadata } from "next";
import { AccessError } from "@/server/access/errors";
import { requireMembership } from "@/server/access/membership";
import { readPrincipal } from "@/server/access/principal";
import { HostClaim } from "./host-claim";
import { HostSession } from "./host-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your session · Simon Says",
  referrer: "no-referrer",
};

type HostPageProps = { params: Promise<{ id: string }> };

const HostPage = async ({ params }: HostPageProps) => {
  const { id } = await params;
  const principal = await readPrincipal();

  let membership;
  try {
    membership = await requireMembership({
      sessionId: id,
      principalId: principal?.id,
      role: "host",
    });
  } catch (error) {
    // Not yet a host on this device: the host link's #token fragment can claim it.
    if (error instanceof AccessError) return <HostClaim sessionId={id} />;
    throw error;
  }

  const { session } = membership;
  return (
    <HostSession
      title={session.title}
      status={session.status}
      joinPath={`/join/${session.inviteCode}`}
    />
  );
};

export default HostPage;
