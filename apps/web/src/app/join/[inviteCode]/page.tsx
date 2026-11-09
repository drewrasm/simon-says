import { joinSessionRequestSchema } from "@simon-says/contracts/session";
import type { Metadata } from "next";
import Link from "next/link";
import { AttendeeDisclosure } from "../../../components/attendee-disclosure";
import { BrandMark } from "../../../components/brand-mark";
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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-10">
      <header>
        <BrandMark />
      </header>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          Join the session
        </h1>
        <p className="text-muted-foreground">
          Read the live captions and save the moments that matter to you.
        </p>
      </div>
      <AttendeeDisclosure />
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
    </main>
  );
};

export default JoinByLinkPage;
