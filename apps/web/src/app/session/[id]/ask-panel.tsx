"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MessageCircleQuestionIcon, SendIcon, XIcon } from "lucide-react";
import type { AskCitation } from "@simon-says/contracts/ask";
import { Button } from "@simon-says/ui/components/button";
import { Bubble, BubbleContent } from "@simon-says/ui/components/bubble";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@simon-says/ui/components/drawer";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@simon-says/ui/components/input-group";
import { Label } from "@simon-says/ui/components/label";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "@simon-says/ui/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@simon-says/ui/components/message-scroller";
import { readAskResponse } from "./ask-client";

const desktopQuery = "(min-width: 1024px)";
const subscribeDesktop = (notify: () => void) => {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const isDesktop = () => window.matchMedia(desktopQuery).matches;
const serverDesktop = () => false;

export const AskAnswer = ({
  answer,
  citations,
  onCitation,
}: {
  answer: string;
  citations: AskCitation[];
  onCitation: () => void;
}) => (
  <>
    <div className="whitespace-pre-wrap leading-relaxed">
      {answer.split(/(\[\d{2,}:\d{2}\])/).map((part, index) => {
        const citation = citations.find(
          (source) => `[${source.timestamp}]` === part,
        );
        return citation ? (
          <a
            key={index}
            href={`#t=${Math.floor(citation.startMs)}`}
            onClick={onCitation}
            className="rounded text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {part}
          </a>
        ) : (
          part
        );
      })}
    </div>
    {answer && citations.length ? (
      <div className="flex flex-wrap gap-2" aria-label="Caption sources">
        {citations.map((citation) => (
          <a
            key={`${citation.segmentId}:${citation.startMs}`}
            href={`#t=${Math.floor(citation.startMs)}`}
            onClick={onCitation}
            title={citation.excerpt}
            className="inline-flex min-h-11 items-center rounded-full border bg-muted px-3 text-xs font-medium tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            [{citation.timestamp}]
          </a>
        ))}
      </div>
    ) : null}
  </>
);

export const AskPanel = ({ sessionId }: { sessionId: string }) => {
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    isDesktop,
    serverDesktop,
  );
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<AskCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next && active.current) {
      active.current.abort();
      active.current = null;
      setLoading(false);
      setAnswer("");
      setCitations([]);
      setAsked("");
    }
  };
  const submit = async () => {
    const value = question.trim();
    if (!value || value.length > 500 || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setAsked(value);
    setAnswer("");
    setCitations([]);
    setError(false);
    setLoading(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value }),
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
      }
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={changeOpen}
      modal="trap-focus"
      swipeDirection={desktop ? "right" : "down"}
      disablePointerDismissal
    >
      <DrawerTrigger render={<Button variant="secondary" className="h-11" />}>
        <MessageCircleQuestionIcon data-icon="inline-start" />
        Ask
      </DrawerTrigger>
      <DrawerContent className="dark shadow-xl lg:[--drawer-content-width:28rem]">
        <div className="flex h-[min(36rem,75dvh)] min-h-0 flex-col lg:h-dvh">
          <DrawerHeader className="flex-row items-start gap-2 p-4 text-left">
            <div className="flex-1">
              <DrawerTitle>Ask Simon</DrawerTitle>
              <DrawerDescription>
                Answers from this talk’s captions, with timestamps.
              </DrawerDescription>
            </div>
            <DrawerClose
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Close Ask Simon"
                />
              }
            >
              <XIcon aria-hidden="true" />
            </DrawerClose>
          </DrawerHeader>
          <MessageScrollerProvider autoScroll>
            <MessageScroller className="flex-1">
              <MessageScrollerViewport>
                <MessageScrollerContent className="gap-4 p-4">
                  {asked ? (
                    <>
                      <MessageScrollerItem messageId={asked} scrollAnchor>
                        <Message align="end">
                          <MessageContent>
                            <MessageHeader>You</MessageHeader>
                            <Bubble align="end" variant="muted">
                              <BubbleContent>{asked}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                      <MessageScrollerItem messageId={`${asked}-answer`}>
                        <Message>
                          <MessageContent>
                            <MessageHeader>Simon</MessageHeader>
                            <div
                              role="status"
                              aria-live="polite"
                              aria-atomic="true"
                              className="flex flex-col gap-3"
                            >
                              {error ? (
                                <p role="alert">
                                  Couldn’t answer. Please try again.
                                </p>
                              ) : (
                                <AskAnswer
                                  answer={answer}
                                  citations={citations}
                                  onCitation={() => changeOpen(false)}
                                />
                              )}
                              {loading ? (
                                <p className="text-sm text-muted-foreground">
                                  {answer
                                    ? "Answering…"
                                    : "Searching this talk…"}
                                </p>
                              ) : null}
                            </div>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    </>
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Ask about an idea from this talk. Simon will look for it
                      in the captions.
                    </p>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
          <form
            className="flex shrink-0 flex-col gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Label htmlFor="ask-question">Question about this talk</Label>
            <InputGroup>
              <InputGroupTextarea
                id="ask-question"
                value={question}
                maxLength={500}
                rows={2}
                placeholder="What did the speaker say about…?"
                disabled={loading}
                onChange={(event) => setQuestion(event.target.value)}
                className="text-base"
              />
              <InputGroupAddon align="block-end" className="justify-between">
                <span className="text-xs tabular-nums">
                  {question.length}/500
                </span>
                <Button
                  type="submit"
                  disabled={loading || !question.trim()}
                  className="h-11"
                >
                  <SendIcon aria-hidden="true" />
                  {loading ? "Answering…" : "Ask Simon"}
                </Button>
              </InputGroupAddon>
            </InputGroup>
            <p className="text-xs text-muted-foreground">
              Based only on captions so far. Check the source before relying on
              an answer.
            </p>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
