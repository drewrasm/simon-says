"use client";

import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@simon-says/ui/components/drawer";
import { Field, FieldLabel } from "@simon-says/ui/components/field";
import { Label } from "@simon-says/ui/components/label";
import { Switch } from "@simon-says/ui/components/switch";
import { Textarea } from "@simon-says/ui/components/textarea";
import { ClockIcon, SquarePenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useClipState } from "./clip-context";
import { lastLine } from "./clip-line";
import { formatTalkTime } from "./talk-time";
import { NOTE_MAX_LENGTH, useNoteDraft } from "./use-note-draft";

type NoteComposerProps = {
  sessionId: string;
  triggerLabel: string;
  triggerClassName?: string;
  /** Where to go once saved: the notes page, or stay and refresh it. */
  afterSave: "open-notes" | "refresh";
};

/**
 * Phone "New note" sheet: a private note pinned to where captions had reached
 * when it opened. Before the first caption it is saved unpinned, with its save
 * time. "Attach what was just said" quotes the latest caption line under it.
 */
export const NoteComposer = ({
  sessionId,
  triggerLabel,
  triggerClassName,
  afterSave,
}: NoteComposerProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { lines, talkMs } = useClipState();
  const latest = lastLine(lines);
  const {
    note,
    setNote,
    start,
    discardIfEmpty,
    submit,
    saving,
    canSubmit,
    failureMessage,
    attached,
    setAttached,
    pinnedAtMs,
  } = useNoteDraft({ sessionId, talkMs });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) start();
    else discardIfEmpty();
  };

  const save = async () => {
    if (!(await submit())) return;
    setOpen(false);
    toast.success("Note saved");
    if (afterSave === "open-notes") {
      router.push(`/session/${sessionId}/notes`);
    } else {
      router.refresh();
    }
  };

  return (
    // No backdrop or blur: attendees keep reading the transcript behind the
    // sheet. Focus stays in the sheet for keyboard users, and tapping the page
    // to scroll the transcript doesn't dismiss a half-written note.
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      modal="trap-focus"
      disablePointerDismissal
    >
      <DrawerTrigger
        render={
          <Button variant="secondary" size="lg" className={triggerClassName} />
        }
      >
        <SquarePenIcon data-icon="inline-start" />
        {triggerLabel}
      </DrawerTrigger>
      <DrawerContent className="dark shadow-[0_-8px_24px_rgb(0_0_0/0.12)]">
        <form
          className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DrawerHeader className="p-0 text-left">
            <DrawerTitle>New note</DrawerTitle>
            <DrawerDescription className="flex items-center gap-1.5 tabular-nums">
              <ClockIcon aria-hidden="true" className="size-3.5" />
              {pinnedAtMs === null
                ? "Saved with the time you add it. Pinning to a moment in the talk arrives with live captions."
                : `Pinned to ${formatTalkTime(pinnedAtMs)} in the talk`}
            </DrawerDescription>
          </DrawerHeader>

          <Field>
            <FieldLabel htmlFor="note-text">Your note</FieldLabel>
            <Textarea
              id="note-text"
              rows={5}
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              placeholder="Jot down a thought…"
              onChange={(event) => setNote(event.target.value)}
              className="resize-none text-base"
            />
          </Field>

          <div className="flex flex-col gap-3 rounded-lg bg-muted p-3">
            <div className="flex items-center gap-3">
              <div className="flex grow flex-col gap-0.5">
                <Label htmlFor="attach-quote">Attach what was just said</Label>
                <span
                  id="attach-quote-hint"
                  className="text-xs text-muted-foreground"
                >
                  {latest
                    ? "Adds the last line as a quote under your note."
                    : "Available once live captions start."}
                </span>
              </div>
              <Switch
                id="attach-quote"
                checked={attached !== null}
                disabled={!latest && !attached}
                aria-describedby="attach-quote-hint"
                onCheckedChange={(checked) => {
                  setAttached(checked ? latest : null);
                  if (checked) start();
                }}
              />
            </div>
            {attached ? (
              <blockquote className="border-l-2 border-primary pl-3 text-sm leading-relaxed text-muted-foreground">
                “{attached.text}”
              </blockquote>
            ) : null}
          </div>

          {failureMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{failureMessage}</AlertDescription>
            </Alert>
          ) : null}

          <DrawerFooter className="grid grid-cols-2 gap-2.5 p-0">
            <DrawerClose
              render={<Button type="button" variant="outline" size="lg" />}
            >
              Cancel
            </DrawerClose>
            <Button type="submit" size="lg" disabled={!canSubmit}>
              {saving ? "Saving…" : "Save note"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
};
