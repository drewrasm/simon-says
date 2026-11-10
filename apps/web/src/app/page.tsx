import { Button, buttonVariants } from "@simon-says/ui/components/button";
import { Input } from "@simon-says/ui/components/input";
import { cn } from "cn";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "../components/brand-mark";

const POINTS = [
  {
    title: "Share with a code",
    body: "Put the join code or QR on screen. Guests are reading along in seconds.",
  },
  {
    title: "Read at your own pace",
    body: "Captions follow the talk live. Scroll back to reread without losing your place.",
  },
  {
    title: "Keep private notes",
    body: "Guests pin notes to moments in the talk. Each guest's notes stay their own.",
  },
] as const;

const HomePage = () => (
  <div className="flex min-h-screen flex-col bg-sidebar">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3">
      <BrandMark />
      <Link href="/host/new" className={buttonVariants({ className: "px-3" })}>
        Host a session
      </Link>
    </header>

    <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-14 px-6 pt-12 pb-12 sm:pt-18">
      <div className="flex max-w-[720px] flex-col gap-4">
        <h1 className="text-4xl leading-[1.08] font-bold tracking-[-0.01em] text-balance sm:text-[52px]">
          Every word of your talk, on every phone in the room.
        </h1>
        <p className="text-lg leading-[1.6] text-chart-3">
          Simon Says transcribes you live. Your audience scans a code and reads
          along at their own text size, then clips the moments they want to
          keep.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <section
          aria-labelledby="join-heading"
          className="flex flex-[1_1_360px] flex-col gap-3.5 rounded-xl border bg-card p-6 text-card-foreground shadow-xs"
        >
          <h2 id="join-heading" className="text-lg font-semibold">
            Join a session
          </h2>
          <p className="text-sm text-muted-foreground">
            No account needed. Just the code from the screen.
          </p>
          <form action="/join" className="flex gap-2">
            <label htmlFor="home-code" className="sr-only">
              Session code
            </label>
            <Input
              id="home-code"
              name="code"
              placeholder="KQ742M"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={7}
              className="h-10 min-w-0 grow px-3 text-base font-semibold tracking-[0.08em] shadow-xs md:text-base"
            />
            <Button
              type="submit"
              variant="outline"
              className="h-10 px-4 shadow-xs"
            >
              Join
            </Button>
          </form>
        </section>
        <section
          aria-labelledby="host-heading"
          className="flex flex-[1_1_360px] flex-col gap-3.5 rounded-xl bg-primary p-6 text-primary-foreground"
        >
          <h2 id="host-heading" className="text-lg font-semibold">
            Host a session
          </h2>
          <p className="text-sm text-chart-1">
            No account needed. Name your talk, test your microphone, and go live
            from this browser.
          </p>
          <Link
            href="/host/new"
            className={cn(
              buttonVariants(),
              "h-10 self-start bg-primary-foreground px-4 font-semibold text-primary hover:bg-primary-foreground/90",
            )}
          >
            Start hosting
            <ArrowRightIcon aria-hidden="true" className="size-[15px]" />
          </Link>
        </section>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
        {POINTS.map((point) => (
          <li key={point.title} className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-semibold">{point.title}</h2>
            <p className="text-sm leading-[1.6] text-muted-foreground">
              {point.body}
            </p>
          </li>
        ))}
      </ul>
    </main>
  </div>
);

export default HomePage;
