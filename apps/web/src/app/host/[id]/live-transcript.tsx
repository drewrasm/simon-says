"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@simon-says/ui/components/empty";
import { useLayoutEffect, useRef } from "react";
import { TranscriptLine } from "../../../components/transcript-line";
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
      <Empty className="min-h-64 border">
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
      className="max-h-[60vh] min-h-64 overflow-y-auto rounded-lg border p-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {lines.map((line) =>
        line.kind === "gap" ? (
          <p
            key={line.key}
            className="px-2.5 py-2 text-sm text-muted-foreground italic"
          >
            {formatClock(line.startMs)} · {line.text}
          </p>
        ) : (
          <TranscriptLine
            key={line.key}
            time={line.kind === "interim" ? "Now" : formatClock(line.startMs)}
            text={line.text}
            interim={line.kind === "interim"}
          />
        ),
      )}
    </div>
  );
};
