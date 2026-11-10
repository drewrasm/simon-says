"use client";

import type { CaptureStateEvent } from "@simon-says/contracts/caption";
import type { SessionStatus } from "@simon-says/contracts/session-status";
import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@simon-says/ui/components/card";
import { CircleAlertIcon, MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BrandMark } from "../../../components/brand-mark";
import { LevelMeter } from "../../../components/level-meter";
import { LiveBadge } from "../../../components/live-badge";
import { SessionStatusBadge } from "../../../components/session-status-badge";
import type { CaptureHealth } from "../../../capture/host-capture";
import { useMicrophone } from "../new/use-microphone";
import { feedLines, formatClock } from "./caption-feed";
import { clearHostFragment } from "./host-fragment";
import { LiveTranscript } from "./live-transcript";
import { MicrophonePicker } from "./microphone-picker";
import { ShareCard } from "./share-card";
import { useCaptionFeed } from "./use-caption-feed";
import { useLiveCapture } from "./use-live-capture";

const subscribeNever = () => () => {};
const readOrigin = () => window.location.origin;
const readNoOrigin = () => null;

/** Maps a 0–1 capture level onto the meter's 0–5 bars, like the mic test. */
const toBars = (level: number) =>
  level < 0.01 ? 0 : Math.min(5, Math.ceil(level * 30));

const REASON: Record<NonNullable<CaptureStateEvent["reason"]>, string> = {
  missing_provider_key: "Transcription isn't configured on the server.",
  missing_elasticsearch_config:
    "Transcript storage isn't configured; captions still show live.",
  transcription_failed: "Transcription failed for part of the talk.",
  segment_sink_failed: "Some captions couldn't be saved.",
  backlog_limit: "Captions are falling behind.",
};

const CONNECTION: Record<CaptureHealth["connection"], string> = {
  connecting: "Connecting…",
  open: "Connected",
  reconnecting: "Reconnecting…",
  closed: "Not connected",
  rejected: "Refused by the server",
};

/** Ticks once a second while `since` is set; returns elapsed "HH:MM:SS". */
const useElapsed = (since: number | null) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? null : formatClock(Math.max(0, now - since));
};

type HostSessionProps = {
  sessionId: string;
  title: string | null;
  status: SessionStatus;
  joinPath: string;
  joinCode: string | null;
};

/**
 * Host screen. Before capture starts it is the lobby (share, microphone
 * pre-flight, Go live); while capture runs it is the live console.
 */
export const HostSession = ({
  sessionId,
  title,
  status,
  joinPath,
  joinCode,
}: HostSessionProps) => {
  // The QR must encode the origin attendees reach, which only the browser knows.
  const origin = useSyncExternalStore(subscribeNever, readOrigin, readNoOrigin);
  const joinUrl = origin ? `${origin}${joinPath}` : null;
  const mic = useMicrophone();
  const capture = useLiveCapture(sessionId);
  const { feed } = useCaptionFeed(sessionId);
  const lines = useMemo(() => feedLines(feed), [feed]);
  const elapsed = useElapsed(capture.startedAt);
  const [stopped, setStopped] = useState(false);

  useEffect(clearHostFragment, []);

  const live = capture.startedAt !== null;
  const closed = status === "ended" || status === "expired";

  const stopAudio = capture.stop;
  useEffect(() => {
    if (closed) void stopAudio();
  }, [closed, stopAudio]);

  const heading = title ?? "Your session";
  const deviceLabel =
    mic.devices.find((device) => device.id === mic.deviceId)?.label ??
    "Default microphone";
  const failed =
    !live &&
    (capture.health.mic === "denied" ||
      capture.health.mic === "error" ||
      capture.health.connection === "rejected");

  const goLive = () => {
    const deviceId = mic.deviceId ?? undefined;
    // Release the test stream; capture opens the same device itself.
    mic.release();
    setStopped(false);
    void capture.start(deviceId);
  };

  const endCapture = async () => {
    await capture.stop();
    setStopped(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-sidebar">
      <header className="border-b bg-card">
        <div className="flex w-full flex-wrap items-center gap-3 px-5 py-2.5">
          <BrandMark />
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <span className="min-w-0 flex-[1_1_240px] truncate text-sm font-semibold">
            {heading}
          </span>
          {live ? (
            <>
              {elapsed ? (
                <LiveBadge elapsed={elapsed} className="h-[22px]" />
              ) : (
                <LiveBadge className="h-[22px]" />
              )}
              <Button onClick={() => void endCapture()}>
                <SquareIcon data-icon="inline-start" />
                Stop captions
              </Button>
            </>
          ) : closed ? (
            <SessionStatusBadge status={status} />
          ) : (
            <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-semibold">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-ring"
              />
              Lobby open · not live
            </span>
          )}
        </div>
      </header>

      {live ? (
        <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-wrap content-start items-start gap-4 p-5">
          <h1 className="sr-only">{heading}: live</h1>
          <section
            aria-labelledby="transcript-heading"
            className="min-w-0 flex-[999_1_560px]"
          >
            <Card className="gap-0 py-0">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3.5">
                <div className="flex flex-[1_1_200px] flex-col gap-0.5">
                  <h2
                    id="transcript-heading"
                    className="text-base leading-[1.3] font-semibold"
                  >
                    Live transcript
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    Captions appear on every guest&apos;s screen as you speak.
                  </p>
                </div>
                <span className="flex h-8 min-w-0 items-center gap-2 rounded-lg border bg-background px-2.5 text-[13px] font-medium shadow-xs">
                  <MicIcon
                    aria-hidden="true"
                    className="size-[15px] shrink-0"
                  />
                  <span className="truncate">{deviceLabel}</span>
                  <LevelMeter
                    level={toBars(capture.health.level)}
                    label={`Input level ${toBars(capture.health.level)} of 5`}
                  />
                </span>
              </div>
              <LiveTranscript lines={lines} live />
            </Card>
          </section>
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <ShareCard
              joinUrl={joinUrl}
              joinCode={joinCode}
              headingId="invite-heading"
              title="Invite your audience"
              description={
                joinCode
                  ? "Guests join with this code or the QR code."
                  : "Guests join with the QR code or link."
              }
              compact
            />
            <CaptureHealthCard health={capture.health} state={feed.capture} />
          </aside>
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-[26px] leading-[1.2] font-bold">
              {closed ? "This session has ended" : "Get ready to go live"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {closed
                ? "Guests can still read the captions they saw."
                : "Guests can join now. Their captions start when you go live."}
            </p>
          </div>

          {stopped ? (
            <Alert>
              <AlertDescription>
                Captions stopped. Guests keep what was transcribed. Go live
                again to continue.
              </AlertDescription>
            </Alert>
          ) : null}
          {failed ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>
                {capture.health.mic === "denied"
                  ? "Microphone access was blocked. Allow it in your browser's site settings, then go live again."
                  : capture.health.connection === "rejected"
                    ? "The server didn't accept audio for this session. Reload the page and try again."
                    : "Capture stopped unexpectedly. Check the microphone and go live again."}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-stretch gap-4">
            <ShareCard
              joinUrl={joinUrl}
              joinCode={joinCode}
              headingId="share-heading"
              title="Share with the room"
            />
            {closed ? null : (
              <section
                aria-labelledby="preflight-heading"
                className="min-w-0 flex-[1_1_380px]"
              >
                <Card className="h-full shadow-xs [--card-spacing:--spacing(6)]">
                  <CardHeader>
                    <CardTitle
                      id="preflight-heading"
                      className="text-base font-semibold"
                    >
                      Pre-flight check
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <MicrophonePicker microphone={mic} />
                    <p className="text-xs text-muted-foreground">
                      Only this device captures audio. The test stays in your
                      browser until you go live.
                    </p>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>

          {closed ? null : (
            <section
              aria-labelledby="golive-heading"
              className="flex flex-col items-start justify-between gap-4 rounded-xl bg-primary px-6 py-5 text-primary-foreground sm:flex-row sm:items-center"
            >
              <div>
                <h2 id="golive-heading" className="text-base font-semibold">
                  {mic.status === "active"
                    ? "Everything looks good"
                    : "Test your microphone first"}
                </h2>
                <p className="text-sm text-chart-1">
                  Transcription starts the moment you go live.
                </p>
              </div>
              <Button
                className="h-11 rounded-[10px] bg-primary-foreground px-5 text-[15px] font-semibold text-primary hover:bg-primary-foreground/90"
                disabled={mic.status !== "active"}
                onClick={goLive}
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-live"
                />
                Go live
              </Button>
            </section>
          )}

          {lines.length > 0 ? (
            <section aria-labelledby="transcript-heading">
              <h2
                id="transcript-heading"
                className="mb-3 text-lg font-semibold"
              >
                Transcript so far
              </h2>
              <LiveTranscript lines={lines} live={false} />
            </section>
          ) : null}
        </main>
      )}
    </div>
  );
};

type CaptureHealthCardProps = {
  health: CaptureHealth;
  state: CaptureStateEvent | null;
};

/** Content-free capture health: microphone, connection, unsent audio, and server state. */
const CaptureHealthCard = ({ health, state }: CaptureHealthCardProps) => {
  const unsentSeconds = Math.round(health.unackedMs / 1000);
  const rows: [string, string][] = [
    ["Microphone", health.mic === "live" ? "On" : "Starting…"],
    ["Connection", CONNECTION[health.connection]],
    ["Unsent audio", unsentSeconds > 1 ? `${unsentSeconds} s` : "None"],
    [
      "Captions",
      state === null
        ? "Waiting for the server"
        : state.audio === "receiving"
          ? state.session === "degraded"
            ? "Delayed"
            : "Receiving audio"
          : state.audio === "stalled"
            ? "Audio stalled"
            : "Stopped",
    ],
  ];
  return (
    <section aria-labelledby="health-heading">
      <Card>
        <CardHeader>
          <CardTitle id="health-heading">Capture health</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {state?.reason ? (
            <p role="status" className="text-sm text-destructive">
              {REASON[state.reason]}
            </p>
          ) : null}
          {health.localGaps.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Some audio couldn&apos;t be sent and will show as a gap.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
};
