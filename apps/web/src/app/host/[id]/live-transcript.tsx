"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@simon-says/ui/components/empty";
import { cn } from "cn";
import { useLayoutEffect, useRef } from "react";
import { formatClock, type FeedLine } from "./caption-feed";

type LiveTranscriptProps = { lines: readonly FeedLine[]; live: boolean };

/** Distance from the bottom, in pixels, that still counts as following along. */
const FOLLOW_SLACK = 48;

/**
 * Host's view of the shared caption feed. Follows new lines while scrolled to
 * the bottom; scrolling up to reread stops the jump.
 */
export const LiveTranscript = ({ lines, live }: LiveTranscriptProps) => {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [lines]);

  if (lines.length === 0)
    return (
      <Empty className={live ? "h-[580px]" : "min-h-64 border"}>
        <EmptyHeader>
          <EmptyTitle>{live ? "Listening…" : "No captions yet"}</EmptyTitle>
          <EmptyDescription>
            {live
              ? "Captions appear here and on every guest's screen as you speak."
              : "Captions start when you go live."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div
      ref={scroller}
      role="log"
      aria-label="Live transcript"
      aria-live="polite"
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current =
          element.scrollHeight - element.scrollTop - element.clientHeight <
          FOLLOW_SLACK;
      }}
      className={cn(
        "overflow-y-auto p-1.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        // The console card clips overflow, so the focus ring must sit inside.
        live
          ? "h-[580px] focus-visible:ring-inset"
          : "max-h-[60vh] min-h-64 rounded-lg border",
      )}
    >
      {lines.map((line) =>
        line.kind === "gap" ? (
          <p
            key={line.key}
            className="px-2.5 py-[9px] text-[13px] text-muted-foreground italic"
          >
            {formatClock(line.startMs)} · {line.text}
          </p>
        ) : (
          <TranscriptRow key={line.key} line={line} />
        ),
      )}
    </div>
  );
};

type TranscriptRowProps = { line: FeedLine };

const TranscriptRow = ({ line }: TranscriptRowProps) => {
  const interim = line.kind === "interim";

  return (
    <div
      className={cn(
        "grid grid-cols-[68px_minmax(0,1fr)] gap-3 rounded-lg px-2.5 py-[9px]",
        interim && "bg-muted",
      )}
    >
      <span
        className={cn(
          "pt-1 text-xs tabular-nums",
          interim ? "font-semibold" : "text-muted-foreground",
        )}
      >
        {interim ? "Now" : formatClock(line.startMs)}
      </span>
      <span
        className={cn("text-base leading-[1.6]", interim && "text-chart-3")}
      >
        {line.text}
        {interim ? (
          <span
            aria-hidden="true"
            className="ml-[3px] inline-block h-[17px] w-0.5 animate-pulse bg-primary align-[-3px] motion-reduce:animate-none"
          />
        ) : null}
      </span>
    </div>
  );
};
