"use client";

import { Button } from "@simon-says/ui/components/button";
import { Field, FieldLabel } from "@simon-says/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@simon-says/ui/components/select";
import { CircleCheckIcon } from "lucide-react";
import { LevelMeter } from "../../../components/level-meter";
import type { useMicrophone } from "../new/use-microphone";

const STATUS_MESSAGE = {
  idle: "Test your microphone to see its level.",
  requesting: "Waiting for microphone permission…",
  active: "Microphone is picking you up",
  denied:
    "Microphone access was blocked. Allow it in your browser's site settings, then try again.",
  error: "The microphone stopped or could not be opened. Try again.",
} as const;

type MicrophonePickerProps = { microphone: ReturnType<typeof useMicrophone> };

/** Microphone test, device choice, and level meter for the host lobby. */
export const MicrophonePicker = ({ microphone }: MicrophonePickerProps) => {
  const { status, devices, deviceId, level, start } = microphone;
  const active = status === "active";
  const deviceLabel =
    devices.find((device) => device.id === deviceId)?.label ??
    "Default microphone";

  return (
    <div className="flex flex-col gap-4">
      {active ? null : (
        <div>
          <Button
            variant="outline"
            disabled={status === "requesting"}
            onClick={() => void start(deviceId ?? undefined)}
          >
            {status === "denied" || status === "error"
              ? "Try again"
              : "Test microphone"}
          </Button>
        </div>
      )}
      {active ? (
        <>
          <div className="flex items-start gap-3">
            <CircleCheckIcon
              aria-hidden="true"
              className="mt-px size-[18px] shrink-0 text-success"
            />
            <div className="flex min-w-0 grow flex-col gap-2">
              <div className="flex items-center gap-2">
                <span role="status" className="grow text-sm font-semibold">
                  {STATUS_MESSAGE.active}
                </span>
                <span className="truncate text-[13px] text-muted-foreground">
                  {deviceLabel}
                </span>
              </div>
              <LevelMeter
                size="lg"
                level={level}
                label={`Input level ${level} of 5`}
              />
            </div>
          </div>
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
        </>
      ) : (
        <div className="flex items-center gap-3 text-sm">
          <LevelMeter size="lg" level={level} label="No input" />
          <span
            role="status"
            className={
              status === "denied" || status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            }
          >
            {STATUS_MESSAGE[status]}
          </span>
        </div>
      )}
    </div>
  );
};
