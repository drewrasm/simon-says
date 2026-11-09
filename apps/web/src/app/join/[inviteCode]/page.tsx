import { joinSessionRequestSchema } from "@simon-says/contracts/session";
import type { Metadata } from "next";
import Link from "next/link";
import { AttendeeDisclosure } from "../../../components/attendee-disclosure";
import { JoinShell } from "../join-shell";
import { JoinByLink } from "./join-by-link";

// The invitation is in the path, so never send it to another origin as a referrer.
export const metadata: Metadata = {
  title: "Join a session · Simon Says",
  referrer: "no-referrer",
};

type JoinPageProps = { params: Promise<{ inviteCode: string }> };

const JoinByLinkPage = async ({ params }: JoinPageProps) => {
  const { inviteCode } = await params;
  const valid = joinSessionRequestSchema.safeParse({ inviteCode }).success;

  return (
    <JoinShell
      title="Read along, live"
      description="Follow the speaker's words as live captions on your phone, and save the moments that matter to you."
      after={
        <div className="mt-6">
          <AttendeeDisclosure />
        </div>
      }
    >
      {valid ? (
        <JoinByLink inviteCode={inviteCode} />
      ) : (
        <p role="alert" className="text-sm text-destructive">
          This invitation link is incomplete or invalid. Scan the QR code again,
          or{" "}
          <Link href="/join" className="underline underline-offset-3">
            enter a join code
          </Link>
          .
        </p>
      )}
    </JoinShell>
  );
};

export default JoinByLinkPage;
