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
import { NOTE_MAX_LENGTH, useNoteDraft } from "./use-note-draft";

type NoteComposerProps = {
  sessionId: string;
  triggerLabel: string;
  triggerClassName?: string;
  /** Where to go once saved: the notes page, or stay and refresh it. */
  afterSave: "open-notes" | "refresh";
};

/** Phone "New note" sheet: a private note pinned to the moment it opened. */
export const NoteComposer = ({
  sessionId,
  triggerLabel,
  triggerClassName,
  afterSave,
}: NoteComposerProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    note,
    setNote,
    start,
    discardIfEmpty,
    submit,
    saving,
    canSubmit,
    failureMessage,
  } = useNoteDraft({ sessionId });

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
      <DrawerContent className="shadow-[0_-8px_24px_rgb(0_0_0/0.12)]">
        <form
          className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DrawerHeader className="p-0 text-left">
            <DrawerTitle>New note</DrawerTitle>
            <DrawerDescription className="flex items-center gap-1.5">
              <ClockIcon aria-hidden="true" className="size-3.5" />
              Saved with the time you add it. Pinning to a moment in the talk
              arrives with live captions.
            </DrawerDescription>
          </DrawerHeader>

          <Field>
            <FieldLabel htmlFor="note-text">Your note</FieldLabel>
            <Textarea
              id="note-text"
              rows={3}
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              placeholder="Jot down a thought…"
              onChange={(event) => setNote(event.target.value)}
              className="resize-none text-base"
            />
          </Field>

          <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <div className="flex grow flex-col gap-0.5">
              <Label htmlFor="attach-quote">Attach what was just said</Label>
              <span
                id="attach-quote-hint"
                className="text-xs text-muted-foreground"
              >
                Available once live captions start.
              </span>
            </div>
            <Switch
              id="attach-quote"
              disabled
              aria-describedby="attach-quote-hint"
            />
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
