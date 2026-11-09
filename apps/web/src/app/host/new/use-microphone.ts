"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { microphoneConstraints } from "../../../capture/host-capture";

export type MicStatus = "idle" | "requesting" | "active" | "denied" | "error";
export type MicDevice = { id: string; label: string };

type Running = { stop: () => void };

/** Maps the RMS of a time-domain frame (0 to 1) onto the meter's 0 to 5 bars. */
const toLevel = (rms: number) =>
  rms < 0.01 ? 0 : Math.min(5, Math.ceil(rms * 30));

/**
 * Local microphone test for the host setup screen. Audio stays in this
 * browser tab: it is measured for the level meter and never recorded or sent.
 * Track 2's capture module owns real capture.
 */
export const useMicrophone = () => {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const running = useRef<Running | null>(null);
  const attempt = useRef(0);

  const stop = useCallback(() => {
    running.current?.stop();
    running.current = null;
    setLevel(0);
  }, []);

  const start = useCallback(
    async (id?: string) => {
      stop();
      const mine = ++attempt.current;
      setStatus("requesting");

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(
          microphoneConstraints(id),
        );
      } catch (error) {
        if (mine !== attempt.current) return;
        const denied =
          error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "SecurityError");
        setStatus(denied ? "denied" : "error");
        return;
      }
      if (mine !== attempt.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      let context: AudioContext;
      try {
        context = new AudioContext();
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        setStatus("error");
        return;
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      // Not connected to the destination, so the host never hears themselves.
      context.createMediaStreamSource(stream).connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      let frame = 0;
      let last = -1;
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const next = toLevel(Math.sqrt(sum / samples.length));
        if (next !== last) {
          last = next;
          setLevel(next);
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);

      const [track] = stream.getAudioTracks();
      track?.addEventListener("ended", () => {
        if (mine !== attempt.current) return;
        stop();
        setStatus("error");
      });

      running.current = {
        stop: () => {
          cancelAnimationFrame(frame);
          stream.getTracks().forEach((item) => item.stop());
          void context.close();
        },
      };

      // Labels are only available after permission is granted.
      let all: MediaDeviceInfo[];
      try {
        all = await navigator.mediaDevices.enumerateDevices();
      } catch {
        if (mine !== attempt.current) return;
        stop();
        setStatus("error");
        return;
      }
      if (mine !== attempt.current) return;
      setDevices(
        all
          .filter((device) => device.kind === "audioinput")
          .map((device, index) => ({
            id: device.deviceId,
            label: device.label || `Microphone ${index + 1}`,
          })),
      );
      setDeviceId(track?.getSettings().deviceId ?? id ?? null);
      setStatus("active");
    },
    [stop],
  );

  useEffect(
    () => () => {
      attempt.current += 1;
      stop();
    },
    [stop],
  );

  return { status, devices, deviceId, level, start };
};
