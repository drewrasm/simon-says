import { buttonVariants } from "@simon-says/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@simon-says/ui/components/card";
import Link from "next/link";
import { BrandMark } from "../components/brand-mark";

const POINTS = [
  {
    title: "Share with a QR code",
    body: "Put the code on screen. Guests are reading along in seconds, on their own phones.",
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
  <div className="flex min-h-screen flex-col">
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <BrandMark />
        <Link href="/host/new" className={buttonVariants()}>
          Host a session
        </Link>
      </div>
    </header>

    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Every word of your talk, on every phone in the room.
        </h1>
        <p className="text-lg text-muted-foreground">
          Simon Says transcribes you live. Your audience scans a code, reads
          along on their own screen, and keeps private notes on the moments that
          matter.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="join-heading">
          <Card className="h-full">
            <CardHeader>
              <CardTitle id="join-heading">Join a session</CardTitle>
              <CardDescription>
                No account needed. Scan the QR code on the host&apos;s screen,
                or open the link they share.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/join"
                className={buttonVariants({ variant: "outline" })}
              >
                Join with a code
              </Link>
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="host-heading">
          <Card className="h-full">
            <CardHeader>
              <CardTitle id="host-heading">Host a session</CardTitle>
              <CardDescription>
                No account needed. Name your talk, test your microphone, and go
                live from this browser.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/host/new" className={buttonVariants()}>
                Start hosting
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>

      <ul className="grid gap-6 border-t pt-10 sm:grid-cols-3">
        {POINTS.map((point) => (
          <li key={point.title} className="flex flex-col gap-1">
            <h2 className="font-semibold">{point.title}</h2>
            <p className="text-sm text-muted-foreground">{point.body}</p>
          </li>
        ))}
      </ul>
    </main>
  </div>
);

export default HomePage;
