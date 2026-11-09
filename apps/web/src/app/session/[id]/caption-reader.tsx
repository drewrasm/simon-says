"use client";

import type { SessionStatus } from "@simon-says/contracts/session-status";
import { Button, buttonVariants } from "@simon-says/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@simon-says/ui/components/empty";
import { cn } from "cn";
import {
  AArrowDownIcon,
  AArrowUpIcon,
  ArrowDownToLineIcon,
  CircleCheckIcon,
  NotebookTextIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BrandMark } from "../../../components/brand-mark";
import { LiveBadge } from "../../../components/live-badge";
import { SessionStatusBadge } from "../../../components/session-status-badge";
import {
  TranscriptLine,
  type TranscriptTone,
} from "../../../components/transcript-line";
import { formatSourceTime, type CaptionFeed } from "./caption-feed";
import {
  CaptionSelectionContext,
  type CaptionSelection,
  type SelectedCaptionLine,
} from "./caption-selection";
import { useCaptionSize } from "./use-caption-size";
import { useCaptionStream, type StreamStatus } from "./use-caption-stream";

type CaptionReaderProps = {
  sessionId: string;
  title: string | null;
  status: SessionStatus;
  noteCount: number;
  /** Desktop side panel; on narrow screens notes live on their own page. */
  notesPanel?: ReactNode;
  /**
   * Toolbar slot for actions such as Clip and Note. Client components inside
   * it can call `useCaptionSelection()`. Hidden on wide screens beside the
   * notes panel.
   */
  actions?: ReactNode;
  /** Let attendees select finalized lines (toggle buttons) for clipping. */
  selectable?: boolean;
  /** Selected lines, in source-clock order, whenever the selection changes. */
  onSelectionChange?: (lines: SelectedCaptionLine[]) => void;
  /** Every finalized line (latest revision), whenever the transcript changes. */
  onLinesChange?: (lines: SelectedCaptionLine[]) => void;
  /** Controlled selection by segment ID; omit to let the reader own it. */
  selectedIds?: readonly string[];
  /** Selected segment IDs whenever the attendee toggles a line. */
  onSelectedIdsChange?: (ids: string[]) => void;
};

const NOTES_PANEL_ID = "notes-panel";
/** Within this many pixels of the bottom counts as following live. */
const FOLLOW_THRESHOLD_PX = 48;

const CountBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span
      aria-hidden="true"
      className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground tabular-nums"
    >
      {count}
    </span>
  ) : null;

/** Element ID for a line, so `#t=<startMs>` links can target it. */
const lineAnchor = (startMs: number) => `t=${Math.floor(startMs)}`;

const toneFor = (distanceFromLatest: number): TranscriptTone =>
  (["latest", "recent", "near", "far"] as const)[distanceFromLatest] ?? "old";

const TextSizeControl = ({ compact }: { compact?: boolean }) => {
  const { step, setStep } = useCaptionSize();
  const size = compact ? "h-7 w-8" : "h-11 w-12";
  return (
    <div
      role="group"
      aria-label="Caption text size"
      className="flex gap-0.5 rounded-[10px] bg-secondary p-0.5"
    >
      <Button
        variant="ghost"
        className={size}
        aria-label="Smaller text"
        disabled={step === 0}
        onClick={() => setStep(step - 1)}
      >
        <AArrowDownIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        className={size}
        aria-label="Larger text"
        disabled={step === 2}
        onClick={() => setStep(step + 1)}
      >
        <AArrowUpIcon aria-hidden="true" />
      </Button>
    </div>
  );
};

const effectiveStatus = (
  status: SessionStatus,
  capture: CaptionFeed["capture"],
): SessionStatus =>
  status === "expired" ? status : (capture?.session ?? status);

const StreamNotice = ({
  stream,
  capture,
  onRetry,
}: {
  stream: StreamStatus;
  capture: CaptionFeed["capture"];
  onRetry: () => void;
}) => {
  let message: string | null = null;
  if (stream === "reconnecting") message = "Reconnecting to live captions…";
  else if (stream === "closed") message = "Live captions disconnected.";
  else if (capture?.session === "degraded") message = "Captions are delayed.";
  else if (capture?.session === "live" && capture.audio === "stalled")
    message = "Waiting for the speaker's audio…";
  return (
    <div role="status" className="empty:hidden">
      {message ? (
        <p className="flex flex-wrap items-center justify-center gap-2 border-b bg-secondary px-4 py-2 text-center text-sm text-secondary-foreground">
          {message}
          {stream === "closed" ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
};

/**
 * Attendee caption view, rendered from the member-only caption SSE stream in
 * a dark reader theme. Finalized lines form the polite live log; interim text
 * shows below it with a caret but is not announced. The view follows live
 * until the reader scrolls up, then offers **Return to live**.
 * From the `lg` breakpoint, notes open in a collapsible side panel; below it,
 * the notes icon links to the separate notes page.
 */
export const CaptionReader = ({
  sessionId,
  title,
  status,
  noteCount,
  notesPanel,
  actions,
  selectable = false,
  onSelectionChange,
  onLinesChange,
  selectedIds: controlledIds,
  onSelectedIdsChange,
}: CaptionReaderProps) => {
  const [notesOpen, setNotesOpen] = useState(true);
  const panelShown = Boolean(notesPanel) && notesOpen;
  const { feed, status: stream, retry } = useCaptionStream(sessionId);
  const { step } = useCaptionSize();

  const [following, setFollowing] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  const [ownIds, setOwnIds] = useState<readonly string[]>([]);
  const ids = controlledIds ?? ownIds;
  const selectedSet = useMemo(() => new Set(ids), [ids]);
  const setIds = useCallback(
    (next: string[]) => {
      if (controlledIds === undefined) setOwnIds(next);
      onSelectedIdsChange?.(next);
    },
    [controlledIds, onSelectedIdsChange],
  );

  const finalLines = useMemo<SelectedCaptionLine[]>(
    () =>
      feed.lines.flatMap((line) =>
        line.kind === "final"
          ? [
              {
                segmentId: line.segmentId,
                revision: line.revision,
                startMs: line.startMs,
                endMs: line.endMs,
                text: line.text,
              },
            ]
          : [],
      ),
    [feed.lines],
  );
  const selectedLines = useMemo(
    () => finalLines.filter((line) => selectedSet.has(line.segmentId)),
    [finalLines, selectedSet],
  );
  const clear = useCallback(() => setIds([]), [setIds]);
  const selection = useMemo<CaptionSelection>(
    () => ({ lines: selectedLines, clear, sourceMs: feed.sourceMs }),
    [selectedLines, clear, feed.sourceMs],
  );
  useEffect(() => {
    onSelectionChange?.(selectedLines);
  }, [onSelectionChange, selectedLines]);
  useEffect(() => {
    onLinesChange?.(finalLines);
  }, [onLinesChange, finalLines]);

  const toggle = useCallback(
    (segmentId: string) =>
      setIds(
        selectedSet.has(segmentId)
          ? ids.filter((id) => id !== segmentId)
          : [...ids, segmentId],
      ),
    [ids, selectedSet, setIds],
  );

  // `#t=<startMs>` jumps to the line spoken at that source time, once the
  // line has arrived. Scrolling away from the bottom pauses following live.
  const pendingHashMs = useRef<number | null>(null);
  const latestLines = useRef(finalLines);
  const jumpToHash = useCallback(() => {
    const ms = pendingHashMs.current;
    if (ms === null) return;
    const target = [...latestLines.current]
      .reverse()
      .find((line) => line.startMs <= ms);
    const element = target
      ? document.getElementById(lineAnchor(target.startMs))
      : null;
    if (!element) return;
    pendingHashMs.current = null;
    element.scrollIntoView({ block: "center" });
  }, []);
  useEffect(() => {
    const read = () => {
      const match = /^#t=(\d+)$/.exec(window.location.hash);
      pendingHashMs.current = match ? Number(match[1]) : null;
      jumpToHash();
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [jumpToHash]);
  useEffect(() => {
    latestLines.current = finalLines;
    jumpToHash();
  }, [finalLines, jumpToHash]);

  // Keep the newest caption in view while following live.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (following && element) element.scrollTop = element.scrollHeight;
  }, [following, feed.lines, feed.interim, step, panelShown]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      FOLLOW_THRESHOLD_PX;
    setFollowing(atBottom);
  };

  const returnToLive = () => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
    setFollowing(true);
  };

  const shownStatus = effectiveStatus(status, feed.capture);
  const finals = feed.lines.filter((line) => line.kind === "final");
  const distanceFromLatest = new Map(
    finals.map((line, index) => [line.key, finals.length - 1 - index]),
  );
  const hasCaptions = feed.lines.length > 0 || feed.interim.length > 0;
  const ended = shownStatus === "ended" || shownStatus === "expired";

  return (
    <CaptionSelectionContext.Provider value={selection}>
      <div
        className={cn(
          "dark h-dvh overflow-hidden bg-background text-foreground",
          panelShown &&
            "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]",
        )}
      >
        <main className="flex h-dvh min-w-0 flex-col">
          <header className="flex items-center gap-3 border-b py-3 pr-4 pl-5 lg:flex-wrap lg:px-6">
            <BrandMark className="hidden lg:inline-flex" />
            <span
              aria-hidden="true"
              className="mx-1 hidden h-5 w-px bg-border lg:block"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-2.5">
              <div className="flex items-center gap-2">
                {shownStatus === "live" ? (
                  <LiveBadge className="h-5 text-[11px] tracking-wider uppercase" />
                ) : (
                  <SessionStatusBadge status={shownStatus} />
                )}
              </div>
              <h1 className="truncate text-[17px] font-bold lg:text-sm lg:font-semibold">
                {title ?? "Live session"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden lg:block">
                <TextSizeControl compact />
              </div>
              <Link
                href={`/session/${sessionId}/notes`}
                aria-label={`My notes, ${noteCount} saved`}
                className={buttonVariants({
                  variant: "ghost",
                  size: "icon-lg",
                  className: notesPanel
                    ? "relative size-11 lg:hidden"
                    : "relative size-11",
                })}
              >
                <NotebookTextIcon aria-hidden="true" />
                <CountBadge count={noteCount} />
              </Link>
              {notesPanel ? (
                <Button
                  variant={notesOpen ? "outline" : "default"}
                  className="hidden lg:inline-flex"
                  aria-expanded={notesOpen}
                  aria-controls={NOTES_PANEL_ID}
                  onClick={() => setNotesOpen((open) => !open)}
                >
                  {notesOpen ? (
                    <PanelRightCloseIcon data-icon="inline-start" />
                  ) : (
                    <PanelRightOpenIcon data-icon="inline-start" />
                  )}
                  {notesOpen ? "Hide notes" : `Show notes (${noteCount})`}
                </Button>
              ) : null}
            </div>
          </header>

          <StreamNotice
            stream={stream}
            capture={feed.capture}
            onRetry={retry}
          />

          <section
            aria-labelledby="captions-heading"
            className="relative min-h-0 flex-1"
          >
            <h2 id="captions-heading" className="sr-only">
              Live captions
            </h2>
            <div
              ref={scroller}
              onScroll={onScroll}
              tabIndex={0}
              aria-label="Caption transcript"
              className="h-full overflow-y-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <div className="mx-auto flex min-h-full w-full max-w-[920px] flex-col justify-end gap-[18px] px-5 pt-5 pb-6 lg:gap-[26px] lg:px-6 lg:pt-10">
                <div
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions text"
                  className="flex flex-col gap-[18px] lg:gap-[26px]"
                >
                  {hasCaptions ? (
                    feed.lines.map((line) => {
                      if (line.kind === "gap") {
                        return (
                          <p
                            key={line.key}
                            className="grid grid-cols-1 gap-x-5 text-sm text-muted-foreground italic lg:grid-cols-[76px_minmax(0,1fr)]"
                          >
                            <span className="hidden text-[13px] not-italic tabular-nums lg:block">
                              {formatSourceTime(line.startMs)}
                            </span>
                            <span>Captions are missing for this part.</span>
                          </p>
                        );
                      }
                      return (
                        <TranscriptLine
                          key={line.key}
                          time={formatSourceTime(line.startMs)}
                          text={line.text}
                          tone={toneFor(
                            distanceFromLatest.get(line.key) ?? Infinity,
                          )}
                          size={step}
                          timeColumn="wide"
                          onToggle={
                            selectable
                              ? () => toggle(line.segmentId)
                              : undefined
                          }
                          selected={selectedSet.has(line.segmentId)}
                          id={lineAnchor(line.startMs)}
                        />
                      );
                    })
                  ) : (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyTitle>
                          {ended
                            ? "This session has ended"
                            : "Waiting for the host's captions"}
                        </EmptyTitle>
                        <EmptyDescription>
                          {ended
                            ? "No new captions will arrive."
                            : "You're in. Captions appear here as soon as the host starts speaking."}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </div>
                {feed.interim.map((entry) => (
                  <TranscriptLine
                    key={entry.windowId}
                    time="Now"
                    text={entry.text}
                    interim
                    size={step}
                    timeColumn="wide"
                  />
                ))}
              </div>
            </div>
            {following ? null : (
              <Button
                size="lg"
                onClick={returnToLive}
                className="absolute bottom-4 left-1/2 h-11 -translate-x-1/2 rounded-full shadow-lg"
              >
                <ArrowDownToLineIcon data-icon="inline-start" />
                Return to live
              </Button>
            )}
          </section>

          <div
            className={cn(
              "flex flex-wrap items-center gap-2.5 border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:justify-center lg:border-t-0 lg:bg-transparent lg:px-6 lg:pb-6",
            )}
          >
            <div className="lg:hidden">
              <TextSizeControl />
            </div>
            {actions ? (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2.5",
                  notesPanel && "lg:hidden",
                )}
              >
                {actions}
              </div>
            ) : null}
            <div className="flex-1 lg:hidden" />
            <span
              className={cn(
                "inline-flex size-9 items-center justify-center gap-1.5 rounded-full border text-[13px] font-medium text-primary lg:h-8 lg:w-auto lg:px-3",
                !following && "opacity-50",
              )}
            >
              <CircleCheckIcon
                aria-hidden="true"
                className={cn(
                  "size-4",
                  following ? "text-success" : "text-muted-foreground",
                )}
              />
              <span className="sr-only lg:not-sr-only">
                {following ? "Following live" : "Paused"}
              </span>
            </span>
            {selectable ? (
              <span className="hidden text-[13px] text-muted-foreground lg:inline">
                Select lines to clip them, or add a note any time.
              </span>
            ) : null}
          </div>
        </main>
        {notesPanel ? (
          <aside
            id={NOTES_PANEL_ID}
            aria-label="My notes"
            hidden={!notesOpen}
            className="hidden border-l bg-card lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto"
          >
            {notesPanel}
          </aside>
        ) : null}
      </div>
    </CaptionSelectionContext.Provider>
  );
};
