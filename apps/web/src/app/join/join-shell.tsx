import type { ReactNode } from "react";
import { BrandMark } from "../../components/brand-mark";

type JoinShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  /** Content below the main card, such as the QR hint and the disclosure. */
  after?: ReactNode;
};

/** Phone-first attendee join layout: brand, one card, then supporting notes. */
export const JoinShell = ({
  title,
  description,
  children,
  after,
}: JoinShellProps) => (
  <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background px-5 pt-14 pb-8 sm:pt-20">
    <header>
      <BrandMark />
    </header>
    <section
      aria-labelledby="join-heading"
      className="mt-12 flex flex-col gap-5 rounded-2xl border bg-card p-5 text-card-foreground shadow-xs sm:mt-16"
    >
      <div className="flex flex-col gap-1.5">
        <h1
          id="join-heading"
          className="text-2xl leading-tight font-bold tracking-tight"
        >
          {title}
        </h1>
        <p className="text-sm leading-normal text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
    {after}
    <p className="mt-auto pt-8 text-center text-[13px] text-muted-foreground">
      No account or app download needed.
    </p>
  </main>
);
