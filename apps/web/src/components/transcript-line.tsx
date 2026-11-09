import { cn } from "cn";

/** How prominent a line is: the newest final is emphasized, older ones fade. */
export type TranscriptTone = "latest" | "recent" | "near" | "far" | "old";

type TranscriptLineProps = {
  /** Source-clock timestamp, for example "00:12:04", or "Now" for interim text. */
  time: string;
  text: string;
  /** Interim lines are still being spoken; they show a caret and muted text. */
  interim?: boolean;
  tone?: TranscriptTone;
  /** Text size step: 0 small, 1 medium, 2 large. Desktop uses a larger scale. */
  size?: 0 | 1 | 2;
  /** `wide` shows the timestamp column only from the `lg` breakpoint. */
  timeColumn?: "always" | "wide";
  /** When set, the line is a toggle button for selection. */
  onToggle?: (() => void) | undefined;
  selected?: boolean;
  className?: string;
};

const BODY_SIZE = [
  "text-[17px] lg:text-[22px]",
  "text-[20px] lg:text-[26px]",
  "text-[24px] lg:text-[32px]",
] as const;
const LEAD_SIZE = [
  "text-[22px] lg:text-[28px]",
  "text-[25px] lg:text-[32px]",
  "text-[29px] lg:text-[38px]",
] as const;

const TONE: Record<TranscriptTone, string> = {
  latest: "font-semibold text-foreground",
  recent: "text-foreground/85",
  near: "text-foreground/75",
  far: "text-foreground/65",
  old: "text-foreground/55",
};

/** One caption row: optional tabular timestamp gutter and readable caption text. */
export const TranscriptLine = ({
  time,
  text,
  interim = false,
  tone = "recent",
  size = 1,
  timeColumn = "always",
  onToggle,
  selected = false,
  className,
}: TranscriptLineProps) => {
  const lead = interim || tone === "latest";
  const rowClass = cn(
    "grid w-full items-baseline gap-x-5 text-left",
    timeColumn === "always"
      ? "grid-cols-[76px_minmax(0,1fr)]"
      : "grid-cols-1 lg:grid-cols-[76px_minmax(0,1fr)]",
    onToggle &&
      "-mx-3 w-[calc(100%+1.5rem)] cursor-pointer rounded-lg px-3 py-2 outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-foreground/10 aria-pressed:ring-1 aria-pressed:ring-foreground/25",
    className,
  );
  const content = (
    <>
      <span
        className={cn(
          "text-[13px] tabular-nums",
          timeColumn === "wide" && "hidden lg:block",
          interim
            ? "font-semibold text-live-foreground"
            : "text-muted-foreground",
        )}
      >
        {time}
      </span>
      <span
        className={cn(
          "block leading-normal",
          lead ? LEAD_SIZE[size] : BODY_SIZE[size],
          interim ? "text-muted-foreground" : TONE[tone],
        )}
      >
        {text}
        {interim ? (
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-[1em] w-0.5 animate-pulse bg-foreground align-[-0.15em] motion-reduce:animate-none"
          />
        ) : null}
      </span>
    </>
  );

  return onToggle ? (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={rowClass}
    >
      {content}
    </button>
  ) : (
    <div className={rowClass}>{content}</div>
  );
};
