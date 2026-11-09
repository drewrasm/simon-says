"use client";

import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import type { RecapResponse } from "@simon-says/contracts/recap";
import { Button, buttonVariants } from "@simon-says/ui/components/button";
import { DownloadIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { formatTalkTime } from "../talk-time";
import {
  createRecap,
  getRecap,
  recapExportHref,
  recapSelection,
} from "./recap-client";

const POLL_MS = 2_000;
const MAX_READ_RETRIES = 5;

// The attendee's latest recap per session. Kept in memory as well, so the
// recap still shows where browser storage is blocked.
const remembered = new Map<string, string | null>();
const listeners = new Set<() => void>();
const storageKey = (sessionId: string) => `simon-says:recap:${sessionId}`;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const readRecapId = (sessionId: string) => {
  if (remembered.has(sessionId)) return remembered.get(sessionId) ?? null;
  try {
    return localStorage.getItem(storageKey(sessionId));
  } catch {
    return null;
  }
};

const rememberRecapId = (sessionId: string, id: string | null) => {
  remembered.set(sessionId, id);
  try {
    if (id) localStorage.setItem(storageKey(sessionId), id);
    else localStorage.removeItem(storageKey(sessionId));
  } catch {
    // Memory still holds it for this visit.
  }
  listeners.forEach((listener) => listener());
};

const CREATE_ERROR = {
  busy: "A recap is already being written. Try again in a moment.",
  conflict: "Your clips just changed. Try again.",
  rejected: "Couldn't start a recap from these clips.",
  error: "Couldn't start the recap. Check your connection and try again.",
} as const;

const failureText = (reason: string | null) =>
  reason === "no_resolved_evidence"
    ? "None of your clips have captions yet, so there was nothing to recap."
    : "The recap couldn't be written. Try again.";

type TakeawaysProps = { sessionId: string; recap: RecapResponse };

const Takeaways = ({ sessionId, recap }: TakeawaysProps) => (
  <ol className="flex flex-col gap-3">
    {recap.takeaways.map((takeaway, index) => (
      <li
        key={index}
        className="flex flex-col gap-2 rounded-xl border bg-card p-4"
      >
        <p className="text-[15px] leading-relaxed">{takeaway.text}</p>
        <ul className="flex flex-col gap-1.5 border-t pt-2.5">
          {takeaway.citations.map((citation) => (
            <li
              key={`${citation.bookmarkId}:${citation.segmentId}`}
              className="text-sm text-muted-foreground"
            >
              <Link
                href={`/session/${sessionId}#t=${Math.floor(citation.range.startMs)}`}
                className="font-semibold tabular-nums underline-offset-4 hover:underline"
              >
                {formatTalkTime(citation.range.startMs)}
              </Link>{" "}
              “{citation.excerpt}”
            </li>
          ))}
        </ul>
      </li>
    ))}
  </ol>
);

type RecapSectionProps = { sessionId: string; bookmarks: BookmarkResponse[] };

/** The attendee's private recap, written only from their own saved clips. */
export const RecapSection = ({ sessionId, bookmarks }: RecapSectionProps) => {
  const router = useRouter();
  const recapId = useSyncExternalStore(
    subscribe,
    () => readRecapId(sessionId),
    () => null,
  );
  const [loaded, setLoaded] = useState<{
    recap: RecapResponse;
    clips: string;
  }>();
  const [retries, setRetries] = useState(0);
  const [starting, setStarting] = useState(false);
  // Reused only while the same attempt is being resent after a lost response.
  const operationId = useRef<string>(undefined);

  // A recap read before the clips last changed is checked again, because the
  // server marks it stale and refuses to export it.
  const clips = bookmarks.map(({ id, revision }) => `${id}:${revision}`).join();
  const recap =
    loaded?.recap.id === recapId && loaded.clips === clips
      ? loaded.recap
      : undefined;
  const unreadable = retries >= MAX_READ_RETRIES;
  const inProgress =
    starting ||
    (recapId !== null &&
      !unreadable &&
      (!recap || recap.status === "pending" || recap.status === "running"));

  useEffect(() => {
    if (!recapId || !inProgress || starting) return;

    let cancelled = false;
    const timer = setTimeout(
      async () => {
        const result = await getRecap(recapId);
        if (cancelled) return;
        if (result.kind === "ok") {
          setRetries(0);
          setLoaded({ recap: result.recap, clips });
        } else if (result.kind === "missing") rememberRecapId(sessionId, null);
        else setRetries((count) => count + 1);
      },
      recap || retries ? POLL_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [recapId, inProgress, starting, recap, retries, sessionId, clips]);

  const selection = recapSelection(bookmarks);

  const generate = async () => {
    operationId.current ??= crypto.randomUUID();
    setStarting(true);
    const result = await createRecap(sessionId, {
      operationId: operationId.current,
      bookmarks: selection,
    });
    setStarting(false);

    if (result.kind !== "error") operationId.current = undefined;
    if (result.kind === "created") {
      rememberRecapId(sessionId, result.id);
      return;
    }
    toast.error(CREATE_ERROR[result.kind]);
    if (result.kind === "conflict") router.refresh();
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="grow text-sm font-semibold">My recap</h2>
        {recap?.status === "ready" ? (
          <a
            href={recapExportHref(recap.id)}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <DownloadIcon aria-hidden="true" />
            Download Markdown
          </a>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={inProgress || selection.length === 0}
          onClick={() => void generate()}
        >
          <SparklesIcon aria-hidden="true" />
          {recapId ? "New recap" : "Generate recap"}
        </Button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {inProgress ? (
          <p className="text-sm text-muted-foreground">
            {starting || recap
              ? "Writing your recap from your clips…"
              : "Loading your recap…"}
          </p>
        ) : null}
        {!recapId && !starting ? (
          <p className="text-sm text-muted-foreground">
            {selection.length === 0
              ? "Save a clip first. A recap is written only from clips you saved."
              : "A private summary of what you saved, with each point linked to its source."}
          </p>
        ) : null}
        {unreadable && !starting ? (
          <p role="alert" className="flex items-center gap-2 text-sm">
            Couldn&apos;t load your recap. Check your connection.
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRetries(0)}
            >
              Try again
            </Button>
          </p>
        ) : null}
        {recap?.status === "failed" ? (
          <p role="alert" className="text-sm text-destructive">
            {failureText(recap.failureReason)}
          </p>
        ) : null}
        {recap?.status === "stale" ? (
          <p className="text-sm text-muted-foreground">
            Your clips changed after this recap was written. Generate a new one.
          </p>
        ) : null}
        {recap?.status === "ready" ? (
          <Takeaways sessionId={sessionId} recap={recap} />
        ) : null}
      </div>
    </section>
  );
};
