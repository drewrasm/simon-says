import { cn } from "cn";

type JoinCodeProps = { code: string; href: string; className?: string };

/** Formats a six-character join code as "KQ7·42M" for reading aloud from a screen. */
const formatCode = (code: string) =>
  code.length === 6 ? `${code.slice(0, 3)}·${code.slice(3)}` : code;

/** Join code block shown to hosts: label, large code, and the short join link. */
export const JoinCode = ({ code, href, className }: JoinCodeProps) => (
  <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
    <span className="text-[13px] font-medium text-muted-foreground">
      Join code
    </span>
    <span
      className="text-[40px] leading-[1.1] font-bold tracking-[0.06em]"
      aria-label={code}
    >
      {formatCode(code)}
    </span>
    <a href={href} className="text-sm underline underline-offset-3">
      {href.replace(/^https?:\/\//, "")}
    </a>
  </div>
);
