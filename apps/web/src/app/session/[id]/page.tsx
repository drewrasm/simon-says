import type { Metadata } from "next";
import { AccessError } from "@/server/access/errors";
import { requireMembership } from "@/server/access/membership";
import { readPrincipal } from "@/server/access/principal";
import { CaptionReader } from "./caption-reader";
import { NotJoined } from "./not-joined";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live captions · Simon Says" };

type SessionPageProps = { params: Promise<{ id: string }> };

const SessionPage = async ({ params }: SessionPageProps) => {
  const { id } = await params;
  const principal = await readPrincipal();

  let membership;
  try {
    membership = await requireMembership({
      sessionId: id,
      principalId: principal?.id,
    });
  } catch (error) {
    if (error instanceof AccessError) return <NotJoined />;
    throw error;
  }

  return (
    <CaptionReader
      title={membership.session.title}
      status={membership.session.status}
    />
  );
};

export default SessionPage;
