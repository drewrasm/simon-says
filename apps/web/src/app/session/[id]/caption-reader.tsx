"use client";

import type { SessionStatus } from "@simon-says/contracts/session-status";
import { Button, buttonVariants } from "@simon-says/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@simon-says/ui/components/empty";
import {
  NotebookTextIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BrandMark } from "../../../components/brand-mark";
import { SessionStatusBadge } from "../../../components/session-status-badge";

type CaptionReaderProps = {
  sessionId: string;
  title: string | null;
  status: SessionStatus;
  noteCount: number;
  /** Desktop side panel; on narrow screens notes live on their own page. */
  notesPanel?: ReactNode;
  /** Phone toolbar actions, such as the note sheet. Hidden beside the panel. */
  actions?: ReactNode;
};

const NOTES_PANEL_ID = "notes-panel";

const CountBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span
      aria-hidden="true"
      className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground tabular-nums"
    >
      {count}
    </span>
  ) : null;

/**
 * Attendee caption view. The log region will receive Track 2's SSE captions in
 * C2; until then it shows an honest waiting state, never fixture text.
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
}: CaptionReaderProps) => {
  const [notesOpen, setNotesOpen] = useState(true);
  const panelShown = Boolean(notesPanel) && notesOpen;

  return (
    <div
      className={
        panelShown
          ? "lg:grid lg:min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]"
          : undefined
      }
    >
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 pt-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <SessionStatusBadge status={status} />
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
                variant="outline"
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
        <h1 className="text-3xl font-semibold tracking-tight">
          {title ?? "Live session"}
        </h1>
        <section
          aria-labelledby="captions-heading"
          className="flex flex-1 flex-col gap-3"
        >
          <h2 id="captions-heading" className="sr-only">
            Live captions
          </h2>
          <div role="log" aria-live="polite" className="flex flex-1 flex-col">
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  {status === "ended"
                    ? "This session has ended"
                    : "Waiting for the host's captions"}
                </EmptyTitle>
                <EmptyDescription>
                  {status === "ended"
                    ? "No new captions will arrive."
                    : "You're in. Captions appear here as soon as the host starts speaking."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </section>
        {actions ? (
          <div
            className={
              notesPanel
                ? "sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2.5 border-t bg-background px-6 py-3 lg:hidden"
                : "sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2.5 border-t bg-background px-6 py-3"
            }
          >
            {actions}
          </div>
        ) : null}
      </main>
      {notesPanel ? (
        <aside
          id={NOTES_PANEL_ID}
          aria-label="My notes"
          hidden={!notesOpen}
          className="hidden border-l bg-muted/30 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto"
        >
          {notesPanel}
        </aside>
      ) : null}
    </div>
  );
};
