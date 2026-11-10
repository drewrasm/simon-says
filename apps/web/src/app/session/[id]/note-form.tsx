"use client";

import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import { Label } from "@simon-says/ui/components/label";
import { Textarea } from "@simon-says/ui/components/textarea";
import { ClockIcon, SquarePenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useClipState } from "./clip-context";
import { formatTalkTime } from "./talk-time";
import { NOTE_MAX_LENGTH, useNoteDraft } from "./use-note-draft";

type NoteFormProps = { sessionId: string };

/**
 * Desktop inline note form in the notes panel. Ctrl or Cmd + Enter saves
 * without leaving the keyboard.
 */
export const NoteForm = ({ sessionId }: NoteFormProps) => {
  const router = useRouter();
  const { talkMs } = useClipState();
  const {
    note,
    setNote,
    submit,
    saving,
    canSubmit,
    failureMessage,
    pinnedAtMs,
  } = useNoteDraft({ sessionId, talkMs });

  const save = async () => {
    if (!(await submit())) return;
    toast.success("Note added");
    router.refresh();
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-[14px] border border-input bg-background/60 p-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Label
        htmlFor="panel-note"
        className="gap-1.5 text-xs font-medium text-muted-foreground"
      >
        <SquarePenIcon aria-hidden="true" className="size-[13px]" />
        New note
      </Label>
      <Textarea
        id="panel-note"
        rows={3}
        value={note}
        maxLength={NOTE_MAX_LENGTH}
        placeholder={
          pinnedAtMs === null
            ? "Jot down a thought."
            : "Jot down a thought. It’s pinned to this moment in the talk."
        }
        aria-describedby="panel-note-pin"
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void save();
          }
        }}
        className="resize-none rounded-none border-0 bg-transparent p-0 text-sm leading-normal focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center gap-2">
        <span
          id="panel-note-pin"
          className="flex grow items-center gap-1.5 text-xs text-muted-foreground tabular-nums"
        >
          <ClockIcon aria-hidden="true" className="size-3" />
          {pinnedAtMs === null
            ? "Saved with the time you add it"
            : `At ${formatTalkTime(pinnedAtMs)}`}
        </span>
        <Button
          type="submit"
          className="px-3 text-[13px] font-semibold"
          disabled={!canSubmit}
        >
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
