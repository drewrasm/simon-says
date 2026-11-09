import { buttonVariants } from "@simon-says/ui/components/button";
import Link from "next/link";
import { BrandMark } from "../../../components/brand-mark";

/** Shown for non-members, revoked members, and unknown or expired sessions alike. */
export const NotJoined = () => (
  <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-10">
    <header>
      <BrandMark />
    </header>
    <h1 className="text-3xl font-semibold tracking-tight">
      You haven&apos;t joined this session
    </h1>
    <p className="text-muted-foreground">
      Scan the QR code on the host&apos;s screen or open their join link on this
      device. Joining on another device or in another browser doesn&apos;t carry
      over.
    </p>
    <div>
      <Link href="/join" className={buttonVariants({ variant: "outline" })}>
        Enter a join code
      </Link>
    </div>
  </main>
);
