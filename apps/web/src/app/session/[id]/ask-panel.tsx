"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  ClockIcon,
  CopyIcon,
  NotebookTextIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { AskCitation, AskTurn } from "@simon-says/contracts/ask";
import { Button } from "@simon-says/ui/components/button";
import { Bubble, BubbleContent } from "@simon-says/ui/components/bubble";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@simon-says/ui/components/input-group";
import { Label } from "@simon-says/ui/components/label";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@simon-says/ui/components/message-scroller";
import { readAskResponse } from "./ask-client";
import { askNoteText, askProvenance } from "./ask-presentation";
import { useClipState } from "./clip-context";
import { paragraphAnchor } from "./clip-line";
import { saveNote, type NoteDraft } from "./save-note";
import { formatTalkTime } from "./talk-time";

type Exchange = { asked: string; answer: string; citations: AskCitation[] };

/** The last three exchanges as turns, within the request's size limits. */
export const historyFor = (exchanges: Exchange[]): AskTurn[] =>
  exchanges
    .slice(-3)
    .flatMap((exchange) => [
      { role: "user" as const, text: exchange.asked },
      { role: "assistant" as const, text: exchange.answer.slice(0, 2000) },
    ])
    .filter((turn) => turn.text.trim().length > 0);

export const AskAnswer = ({
  answer,
  citations,
  onCitation,
}: {
  answer: string;
  citations: AskCitation[];
  onCitation: () => void;
}) => (
  <div className="whitespace-pre-wrap text-base leading-[1.7] wrap-break-word lg:text-[15px]">
    {answer.split(/(\[\d{2,}:\d{2}(?::\d{2})?\])/).map((part, index) => {
      const citation = citations.find(
        (source) => `[${source.timestamp}]` === part,
      );
      return citation ? (
        <a
          key={index}
          href={`#t=${Math.floor(citation.startMs)}`}
          onClick={onCitation}
          aria-label={`Jump to ${formatTalkTime(citation.startMs)} in the transcript`}
          title={citation.excerpt}
          className="mx-0.5 inline-flex h-6 items-center rounded-full border border-white/18 bg-secondary px-2 align-baseline text-xs font-semibold text-primary tabular-nums no-underline hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring lg:h-[22px] lg:px-[7px]"
        >
          {formatTalkTime(citation.startMs)}
        </a>
      ) : (
        part
      );
    })}
  </div>
);

export const AskPanel = ({
  sessionId,
  title,
  onBack,
}: {
  sessionId: string;
  title: string;
  onBack: () => void;
}) => {
  const router = useRouter();
  const { talkMs, lines } = useClipState();
  const [question, setQuestion] = useState("");
  /** Completed exchanges, oldest first. The browser is the only holder. */
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<AskCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const active = useRef<AbortController | null>(null);
  const draft = useRef<NoteDraft | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
    return () => active.current?.abort();
  }, []);

  const reset = () => {
    active.current?.abort();
    active.current = null;
    setQuestion("");
    setExchanges([]);
    setAsked("");
    setAnswer("");
    setCitations([]);
    setLoading(false);
    setError(false);
    setSaveState("idle");
    setCopyState("idle");
    draft.current = null;
    input.current?.focus();
  };
  const submit = async () => {
    const value = question.trim();
    if (
      !value ||
      value.length > 500 ||
      active.current ||
      saveState === "saving"
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    const kept =
      answer && !error
        ? [...exchanges, { asked, answer, citations }]
        : exchanges;
    setExchanges(kept);
    setAsked(value);
    setQuestion("");
    setAnswer("");
    setCitations([]);
    setError(false);
    setLoading(true);
    setSaveState("idle");
    setCopyState("idle");
    draft.current = null;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: value,
          history: historyFor(kept),
        }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(17_000),
        ]),
      });
      await readAskResponse(response, (event) => {
        if (controller.signal.aborted) return;
        if (event.type === "sources") setCitations(event.citations);
        if (event.type === "text") setAnswer((current) => current + event.text);
      });
    } catch {
      if (!controller.signal.aborted) {
        setAnswer("");
        setCitations([]);
        setError(true);
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
        input.current?.focus();
      }
    }
  };
  const note = askNoteText(sessionId, answer, citations);
  const save = async () => {
    if (
      !answer ||
      loading ||
      note.length > 4000 ||
      saveState === "saving" ||
      saveState === "saved"
    )
      return;
    const line = lines.find((line) =>
      citations.some(
        (citation) =>
          citation.segmentId === line.segmentId &&
          citation.startMs === line.startMs &&
          citation.endMs === line.endMs,
      ),
    );
    draft.current ??= {
      bookmarkId: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      sessionId,
      anchor: line ? paragraphAnchor(line) : { kind: "live", markedAtMs: 0 },
    };
    setSaveState("saving");
    const result = await saveNote(draft.current, note);
    setSaveState(result.kind === "saved" ? "saved" : "error");
    if (result.kind === "conflict") draft.current = null;
    if (result.kind === "saved") router.refresh();
  };
  const provenance = askProvenance(citations);
  const backOnPhone = () => {
    if (!window.matchMedia("(min-width: 1024px)").matches) onBack();
  };
  const latest =
    talkMs === null
      ? "waiting for captions"
      : `up to ${formatTalkTime(talkMs)}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background lg:bg-card">
      <header className="flex shrink-0 items-center gap-1 border-b pt-[max(44px,env(safe-area-inset-top))] pr-2 pb-2.5 pl-1 lg:static lg:border-0 lg:p-0">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Back to transcript"
          className="size-11 lg:hidden"
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1 lg:hidden">
          <h2 className="text-[17px] font-bold">Ask about this talk</h2>
          <p className="truncate text-xs text-muted-foreground">
            {title} · {latest}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={reset}
          disabled={saveState === "saving"}
          aria-label="New chat"
          className="h-11 text-xs lg:absolute lg:top-2 lg:right-4 lg:h-8"
        >
          <PlusIcon aria-hidden="true" className="size-4" />
          <span className="hidden lg:inline">New chat</span>
        </Button>
      </header>
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-[18px] px-4 py-[18px] lg:gap-5 lg:py-5">
              {exchanges.map((exchange, index) => (
                <Fragment key={index}>
                  <Bubble align="end" variant="muted" className="max-w-[85%]">
                    <BubbleContent className="rounded-2xl px-3.5 py-2.5 text-base leading-[1.45] lg:rounded-[14px] lg:text-[15px] lg:leading-normal">
                      {exchange.asked}
                    </BubbleContent>
                  </Bubble>
                  <AskAnswer
                    answer={exchange.answer}
                    citations={exchange.citations}
                    onCitation={backOnPhone}
                  />
                </Fragment>
              ))}
              {asked ? (
                <>
                  <Bubble align="end" variant="muted" className="max-w-[85%]">
                    <BubbleContent className="rounded-2xl px-3.5 py-2.5 text-base leading-[1.45] lg:rounded-[14px] lg:text-[15px] lg:leading-normal">
                      {asked}
                    </BubbleContent>
                  </Bubble>
                  <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="flex flex-col gap-2.5"
                  >
                    {error ? (
                      <p role="alert">Couldn’t answer. Please try again.</p>
                    ) : (
                      <>
                        {provenance ? (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                            <SearchIcon
                              aria-hidden="true"
                              className="size-[13px]"
                            />
                            {provenance}
                          </p>
                        ) : null}
                        <AskAnswer
                          answer={answer}
                          citations={citations}
                          onCitation={backOnPhone}
                        />
                      </>
                    )}
                    {loading ? (
                      <p className="text-sm text-muted-foreground">
                        {answer ? "Answering…" : "Searching this talk…"}
                      </p>
                    ) : null}
                  </div>
                  {answer && !loading ? (
                    <div className="-mt-2 -ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Copy answer"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(note);
                            setCopyState("copied");
                          } catch {
                            setCopyState("error");
                          }
                        }}
                      >
                        <CopyIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-10 px-2 text-sm lg:h-8 lg:text-[13px]"
                        onClick={() => void save()}
                        disabled={
                          saveState === "saving" ||
                          saveState === "saved" ||
                          note.length > 4000
                        }
                      >
                        <NotebookTextIcon className="size-4" />
                        {saveState === "saved"
                          ? "Saved"
                          : saveState === "saving"
                            ? "Saving…"
                            : "Save to notes"}
                      </Button>
                      <span role="status" className="text-xs">
                        {saveState === "error"
                          ? "Couldn’t save. Try again."
                          : note.length > 4000
                            ? "Answer is too long to save as a note."
                            : copyState === "copied"
                              ? "Copied"
                              : copyState === "error"
                                ? "Couldn’t copy. Try again."
                                : ""}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : exchanges.length ? null : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Ask about an idea from this talk. Simon will look for it in
                  the captions.
                </p>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="flex shrink-0 flex-col gap-2 border-t bg-card px-4 pt-2.5 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:border-0 lg:pt-3 lg:pb-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Label htmlFor="ask-question" className="sr-only">
            Ask about this talk
          </Label>
          <InputGroup className="rounded-[22px] bg-background max-lg:has-[>[data-align=block-end]]:flex-row has-disabled:bg-background has-disabled:opacity-100 lg:rounded-[14px] dark:bg-background dark:has-disabled:bg-background">
            <InputGroupTextarea
              ref={input}
              id="ask-question"
              value={question}
              maxLength={500}
              rows={1}
              placeholder="Ask about this talk"
              aria-describedby="ask-disclaimer ask-scope"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void submit();
                }
              }}
              className="min-h-11 resize-none px-3.5 text-base lg:min-h-16 lg:text-[15px]"
            />
            <InputGroupAddon
              align="block-end"
              className="justify-between px-2.5 pb-2 max-lg:w-auto max-lg:shrink-0 max-lg:p-1.5"
            >
              <span
                id="ask-scope"
                className="sr-only lg:not-sr-only lg:inline-flex lg:items-center lg:gap-1.5 lg:rounded-lg lg:bg-secondary lg:px-2 lg:py-1.5 lg:text-xs lg:text-primary"
              >
                <ClockIcon aria-hidden="true" className="size-[13px]" />
                Whole talk, {latest}
              </span>
              <Button
                type="submit"
                size="icon"
                aria-label="Send"
                disabled={loading || !question.trim() || saveState === "saving"}
                className="size-9 shrink-0 rounded-full lg:size-8"
              >
                <ArrowUpIcon aria-hidden="true" />
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <p
          id="ask-disclaimer"
          className="text-center text-[11px] leading-normal text-muted-foreground"
        >
          Answers use only this talk&apos;s transcript and can be wrong. Tap a
          timestamp to check.
        </p>
      </div>
    </div>
  );
};
