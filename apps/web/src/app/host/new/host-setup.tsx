"use client";

import { Badge } from "@simon-says/ui/components/badge";
import { Button } from "@simon-says/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@simon-says/ui/components/card";
import { Field, FieldLabel } from "@simon-says/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@simon-says/ui/components/select";
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

export const HostSetup = () => {
  const { status, devices, deviceId, level, start } = useMicrophone();
  const active = status === "active";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <BrandMark />
        <Badge variant="outline">
          Prototype: Start session does nothing yet
        </Badge>
      </header>

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          Set up your session
        </h1>
        <p className="text-muted-foreground">
          Choose a microphone, then start. Attendees join with a code.
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

      <section aria-labelledby="start-heading" className="flex flex-col gap-2">
        <h2 id="start-heading" className="sr-only">
          Start session
        </h2>
        <div>
          {/* Stub: session creation and capture land with Tracks 2 and 3. */}
          <Button size="lg" disabled={!active}>
            Start session
          </Button>
        </div>
        {!active ? (
          <p className="text-sm text-muted-foreground">
            Test your microphone to enable Start.
          </p>
        ) : null}
      </section>
    </main>
  );
};
