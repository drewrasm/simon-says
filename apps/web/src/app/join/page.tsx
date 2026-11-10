import { joinCodeSchema } from "@simon-says/contracts/session";
import type { Metadata } from "next";
import { ScanQrCodeIcon } from "lucide-react";
import { AttendeeDisclosure } from "../../components/attendee-disclosure";
import { JoinByCode } from "./join-by-code";
import { JoinShell } from "./join-shell";

export const metadata: Metadata = { title: "Join a session · Simon Says" };

type JoinPageProps = {
  searchParams: Promise<{ code?: string | string[] | undefined }>;
};

const JoinPage = async ({ searchParams }: JoinPageProps) => {
  const { code } = await searchParams;
  // The home page's code field submits here; only a well-formed code is prefilled.
  const initialCode = joinCodeSchema.safeParse(code);

  return (
    <JoinShell
      title="Read along, live"
      description="Enter the code the speaker is showing to follow their words on your phone."
      after={
        <>
          <div
            aria-hidden="true"
            className="my-6 flex items-center gap-3 text-xs font-medium text-muted-foreground"
          >
            <span className="h-px flex-1 bg-border" />
            OR
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-muted"
            >
              <ScanQrCodeIcon className="size-5" />
            </span>
            <p className="text-sm leading-[1.45] text-muted-foreground">
              Point your camera at the QR code on the stage screen to join
              instantly.
            </p>
          </div>
          <div className="mt-6">
            <AttendeeDisclosure />
          </div>
        </>
      }
    >
      <JoinByCode initialCode={initialCode.success ? initialCode.data : ""} />
    </JoinShell>
  );
};

export default JoinPage;
