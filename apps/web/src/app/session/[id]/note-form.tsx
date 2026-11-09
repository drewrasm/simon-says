"use client";

import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import { Label } from "@simon-says/ui/components/label";
import { Textarea } from "@simon-says/ui/components/textarea";
import { ClockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NOTE_MAX_LENGTH, useNoteDraft } from "./use-note-draft";

type NoteFormProps = { sessionId: string };

/**
 * Desktop inline note form in the notes panel. Ctrl or Cmd + Enter saves
 * without leaving the keyboard.
 */
export const NoteForm = ({ sessionId }: NoteFormProps) => {
  const router = useRouter();
  const { note, setNote, submit, saving, canSubmit, failureMessage } =
    useNoteDraft({ sessionId });

  const save = async () => {
    if (!(await submit())) return;
    toast.success("Note added");
    router.refresh();
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Label htmlFor="panel-note">New note</Label>
      <Textarea
        id="panel-note"
        rows={3}
        value={note}
        maxLength={NOTE_MAX_LENGTH}
        placeholder="Jot down a thought."
        aria-describedby="panel-note-pin"
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void save();
          }
        }}
        className="resize-none"
      />
      <div className="flex items-center gap-2">
        <span
          id="panel-note-pin"
          className="flex grow items-center gap-1.5 text-xs text-muted-foreground"
        >
          <ClockIcon aria-hidden="true" className="size-3.5" />
          Saved with the time you add it
        </span>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {saving ? "Adding…" : "Add note"}
        </Button>
      </div>
      {failureMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{failureMessage}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
};
