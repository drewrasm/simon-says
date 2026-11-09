import type { Metadata } from "next";
import { ScanQrCodeIcon } from "lucide-react";
import { AttendeeDisclosure } from "../../components/attendee-disclosure";
import { JoinByCode } from "./join-by-code";
import { JoinShell } from "./join-shell";

export const metadata: Metadata = { title: "Join a session · Simon Says" };

const JoinPage = () => (
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
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-muted"
          >
            <ScanQrCodeIcon className="size-5" />
          </span>
          <p className="text-sm leading-snug text-muted-foreground">
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
    <JoinByCode />
  </JoinShell>
);

export default JoinPage;
