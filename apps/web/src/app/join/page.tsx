import type { Metadata } from "next";
import { AttendeeDisclosure } from "../../components/attendee-disclosure";
import { BrandMark } from "../../components/brand-mark";
import { JoinByCode } from "./join-by-code";

export const metadata: Metadata = { title: "Join a session · Simon Says" };

const JoinPage = () => (
  <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-10">
    <header>
      <BrandMark />
    </header>
    <div className="flex flex-col gap-1">
      <h1 className="text-3xl font-semibold tracking-tight">Join a session</h1>
      <p className="text-muted-foreground">
        Enter the code shown on the host&apos;s screen.
      </p>
    </div>
    <AttendeeDisclosure />
    <JoinByCode />
  </main>
);

export default JoinPage;
