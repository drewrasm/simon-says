import type { SessionStatus } from "@simon-says/contracts/session";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@simon-says/ui/components/empty";
import { BrandMark } from "../../../components/brand-mark";
import { SessionStatusBadge } from "../../../components/session-status-badge";

type CaptionReaderProps = { title: string | null; status: SessionStatus };

/**
 * Attendee caption view. The log region will receive Track 2's SSE captions in
 * C2; until then it shows an honest waiting state, never fixture text.
 */
export const CaptionReader = ({ title, status }: CaptionReaderProps) => (
  <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <BrandMark />
      <SessionStatusBadge status={status} />
    </header>
    <h1 className="text-3xl font-semibold tracking-tight">
      {title ?? "Live session"}
    </h1>
    <section
      aria-labelledby="captions-heading"
      className="flex flex-1 flex-col gap-3"
    >
      <h2 id="captions-heading" className="sr-only">
        Live captions
      </h2>
      <div role="log" aria-live="polite" className="flex flex-1 flex-col">
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {status === "ended"
                ? "This session has ended"
                : "Waiting for the host's captions"}
            </EmptyTitle>
            <EmptyDescription>
              {status === "ended"
                ? "No new captions will arrive."
                : "You're in. Captions appear here as soon as the host starts speaking."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </section>
  </main>
);
