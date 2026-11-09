"use client";

import { captionEventSchema } from "@simon-says/contracts/caption";
import { useCallback, useEffect, useReducer, useState } from "react";
import {
  applyCaptionEvent,
  emptyCaptionFeed,
  type CaptionFeed,
} from "./caption-feed";

/** `reconnecting` while EventSource retries after having been open. */
export type StreamStatus = "connecting" | "open" | "reconnecting" | "closed";

const parse = (data: unknown) => {
  if (typeof data !== "string") return null;
  try {
    const result = captionEventSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

/**
 * Member-only caption SSE (`GET /api/sessions/:id/events`). EventSource
 * reconnects on its own and resends `Last-Event-ID`; the server answers with
 * a replay or snapshot, which the feed upserts by segment ID. A closed stream
 * (for example a 404 after revocation) stays closed until `retry`.
 * Invalid frames are dropped without logging their content.
 */
export const useCaptionStream = (sessionId: string) => {
  const [feed, dispatch] = useReducer(applyCaptionEvent, emptyCaptionFeed);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const source = new EventSource(
      `/api/sessions/${encodeURIComponent(sessionId)}/events`,
    );
    source.onopen = () => setStatus("open");
    source.onerror = () =>
      setStatus(
        source.readyState === EventSource.CLOSED
          ? "closed"
          : (current) => (current === "connecting" ? current : "reconnecting"),
      );
    source.onmessage = (message) => {
      const event = parse(message.data);
      if (event && event.sessionId === sessionId) dispatch(event);
    };
    return () => source.close();
  }, [sessionId, attempt]);

  const retry = useCallback(() => {
    setStatus("connecting");
    setAttempt((value) => value + 1);
  }, []);

  return { feed, status, retry } satisfies {
    feed: CaptionFeed;
    status: StreamStatus;
    retry: () => void;
  };
};
