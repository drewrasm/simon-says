"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HostCapture, type CaptureHealth } from "../../../capture/host-capture";

const IDLE: CaptureHealth = {
  mic: "idle",
  connection: "closed",
  level: 0,
  unackedMs: 0,
  localGaps: [],
};

/**
 * Epochs must increase per session, and the server keeps no epoch API yet, so
 * use wall-clock seconds (fits u32 until 2106) and step past the last one.
 */
const nextEpoch = (last: number) =>
  Math.max(Math.floor(Date.now() / 1000), last + 1);

const ingestUrl = (sessionId: string) => {
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/api/sessions/${encodeURIComponent(sessionId)}/ingest`;
};

/**
 * Owns the host's Track 2 capture instance. Each Go live starts a fresh epoch;
 * stop closes the socket normally, which ends input on the server.
 */
export const useLiveCapture = (sessionId: string) => {
  const capture = useRef<HostCapture | null>(null);
  const epoch = useRef(0);
  const [health, setHealth] = useState<CaptureHealth>(IDLE);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const start = useCallback(
    async (deviceId?: string) => {
      if (capture.current) return;
      epoch.current = nextEpoch(epoch.current);
      const instance = new HostCapture({
        epoch: epoch.current,
        ingestUrl: ingestUrl(sessionId),
        ...(deviceId ? { deviceId } : {}),
      });
      capture.current = instance;
      const release = () => {
        if (capture.current !== instance) return;
        capture.current = null;
        setStartedAt(null);
      };
      instance.subscribe(() => {
        const snapshot = instance.getSnapshot();
        setHealth(snapshot);
        // A refused epoch or a lost microphone is terminal; return to the lobby.
        if (
          snapshot.connection === "rejected" ||
          snapshot.mic === "error" ||
          snapshot.mic === "denied"
        )
          release();
      });
      setStartedAt(Date.now());
      try {
        await instance.start();
      } catch {
        // Health already reports denied or error; allow another attempt.
        release();
      }
    },
    [sessionId],
  );

  const stop = useCallback(async () => {
    const instance = capture.current;
    capture.current = null;
    setStartedAt(null);
    if (instance) await instance.stop();
  }, []);

  useEffect(
    () => () => {
      void capture.current?.stop();
      capture.current = null;
    },
    [],
  );

  return { health, startedAt, start, stop };
};
