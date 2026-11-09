"use client";

import { captionEventSchema } from "@simon-says/contracts/caption";
import { useEffect, useReducer, useState } from "react";
import { applyCaptionEvent, emptyFeed } from "./caption-feed";

export type FeedConnection = "connecting" | "open" | "retrying";

const RETRY_MS = [1_000, 2_000, 5_000, 10_000] as const;

/**
 * Subscribes to the session's caption events. EventSource retries dropped
 * streams itself, but gives up on a non-200 response (such as 503 at the
 * connection cap), so this re-opens with backoff. Replays upsert by segment ID.
 */
export const useCaptionFeed = (sessionId: string) => {
  const [feed, dispatch] = useReducer(applyCaptionEvent, emptyFeed);
  const [connection, setConnection] = useState<FeedConnection>("connecting");

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    const open = () => {
      if (disposed) return;
      source = new EventSource(
        `/api/sessions/${encodeURIComponent(sessionId)}/events`,
      );
      source.onopen = () => {
        attempt = 0;
        setConnection("open");
      };
      source.onmessage = (message: MessageEvent<unknown>) => {
        if (typeof message.data !== "string") return;
        let json: unknown;
        try {
          json = JSON.parse(message.data);
        } catch {
          return;
        }
        const parsed = captionEventSchema.safeParse(json);
        if (parsed.success && parsed.data.sessionId === sessionId)
          dispatch(parsed.data);
      };
      source.onerror = () => {
        if (!source || source.readyState !== EventSource.CLOSED) {
          setConnection("retrying");
          return;
        }
        source.close();
        setConnection("retrying");
        const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
        attempt += 1;
        timer = setTimeout(open, delay);
      };
    };

    open();
    return () => {
      disposed = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [sessionId]);

  return { feed, connection };
};
