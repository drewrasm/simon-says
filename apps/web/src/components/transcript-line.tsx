import { cn } from "cn";

type TranscriptLineProps = {
  /** Source-clock timestamp, for example "00:12:04", or "Now" for interim text. */
  time: string;
  text: string;
  /** Interim lines are still being spoken; they show a caret and muted text. */
  interim?: boolean;
  className?: string;
};

/** One caption row: tabular timestamp gutter and readable caption text. */
export const TranscriptLine = ({
  time,
  text,
  interim = false,
  className,
}: TranscriptLineProps) => (
  <div
    className={cn(
      "grid grid-cols-[68px_minmax(0,1fr)] gap-3 rounded-md px-2.5 py-2",
      interim && "bg-muted",
      className,
    )}
  >
    <span
      className={cn(
        "pt-1 text-xs tabular-nums",
        interim ? "font-semibold" : "text-muted-foreground",
      )}
    >
      {time}
    </span>
    <p
      className={cn(
        "text-base leading-relaxed",
        interim && "text-foreground/75",
      )}
    >
      {text}
      {interim ? (
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-primary align-[-3px]"
        />
      ) : null}
    </p>
  </div>
);
