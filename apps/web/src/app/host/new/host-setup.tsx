"use client";

import {
  createSessionRequestSchema,
  createSessionResponseSchema,
} from "@simon-says/contracts/session";
import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@simon-says/ui/components/card";
import { Field, FieldLabel } from "@simon-says/ui/components/field";
import { Input } from "@simon-says/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@simon-says/ui/components/select";
import { useState } from "react";
import { BrandMark } from "../../../components/brand-mark";
import { LevelMeter } from "../../../components/level-meter";
import { useMicrophone } from "./use-microphone";

const STATUS_MESSAGE = {
  idle: "Test your microphone to see its level.",
  requesting: "Waiting for microphone permission…",
  active: "",
  denied:
    "Microphone access was blocked. Allow it in your browser's site settings, then try again.",
  error: "The microphone stopped or could not be opened. Try again.",
} as const;

const TITLE_MAX_LENGTH = 120;

/** Creates the session, then opens the host page; `hostPath` carries the host token in its fragment. */
const createSession = async (title: string) => {
  const request = createSessionRequestSchema.parse({
    title: title.trim() || undefined,
  });
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (response.status !== 201) throw new Error("Session was not created.");
  return createSessionResponseSchema.parse(await response.json());
};

export const HostSetup = () => {
  const { status, devices, deviceId, level, start } = useMicrophone();
  const active = status === "active";
  const [title, setTitle] = useState("");
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);

  const startSession = async () => {
    setStarting(true);
    setStartFailed(false);
    try {
      const { hostPath } = await createSession(title);
      // A full navigation keeps the #token fragment for the host page to read.
      window.location.assign(hostPath);
    } catch {
      setStartFailed(true);
      setStarting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <BrandMark />
      </header>

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          Set up your session
        </h1>
        <p className="text-muted-foreground">
          Choose a microphone, then start. Attendees join by scanning a QR code.
        </p>
      </div>

      <section aria-labelledby="audio-heading">
        <Card>
          <CardHeader>
            <CardTitle id="audio-heading">Microphone</CardTitle>
            <CardDescription>
              Only this device captures audio. The test below stays in your
              browser: nothing is recorded or sent.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {active ? (
              <Field>
                <FieldLabel htmlFor="mic-select">Input device</FieldLabel>
                <Select
                  value={deviceId}
                  onValueChange={(id) => {
                    if (id) void start(id);
                  }}
                  items={devices.map(({ id, label }) => ({ value: id, label }))}
                >
                  <SelectTrigger id="mic-select" className="w-full">
                    <SelectValue placeholder="Choose a microphone" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map(({ id, label }) => (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <div>
                <Button
                  variant="outline"
                  disabled={status === "requesting"}
                  onClick={() => void start()}
                >
                  {status === "denied" || status === "error"
                    ? "Try again"
                    : "Test microphone"}
                </Button>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <LevelMeter
                level={level}
                label={active ? `Input level ${level} of 5` : "No input"}
              />
              <span
                role="status"
                className={
                  status === "denied" || status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {active
                  ? "Microphone is on. Speak to see the level move."
                  : STATUS_MESSAGE[status]}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="start-heading" className="flex flex-col gap-4">
        <h2 id="start-heading" className="sr-only">
          Start session
        </h2>
        <Field>
          <FieldLabel htmlFor="session-title">
            Session title (optional)
          </FieldLabel>
          <Input
            id="session-title"
            value={title}
            maxLength={TITLE_MAX_LENGTH}
            placeholder="e.g. Scaling caption pipelines"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <div>
          <Button
            size="lg"
            disabled={!active || starting}
            onClick={() => void startSession()}
          >
            {starting ? "Starting…" : "Start session"}
          </Button>
        </div>
        {startFailed ? (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t start the session. Check your connection and try
              again.
            </AlertDescription>
          </Alert>
        ) : null}
        {!active ? (
          <p className="text-sm text-muted-foreground">
            Test your microphone to enable Start.
          </p>
        ) : null}
      </section>
    </main>
  );
};
