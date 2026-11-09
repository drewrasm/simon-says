"use client";

import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { Button } from "@simon-says/ui/components/button";
import { Input } from "@simon-says/ui/components/input";
import { DownloadIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { deleteBookmark, updateBookmarkNote } from "../bookmark-client";
import { NOTE_MAX_LENGTH } from "../use-note-draft";
import { notesMarkdown } from "./notes-markdown";

/** Removes one of the attendee's own cards. */
export const RemoveCardButton = ({
  bookmarkId,
  label,
}: {
  bookmarkId: string;
  label: string;
}) => {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const remove = async () => {
    setRemoving(true);
    const removed = await deleteBookmark(bookmarkId);
    setRemoving(false);
    if (!removed) {
      toast.error("Couldn't remove it. Check your connection and try again.");
      return;
    }
    toast.success("Removed");
    router.refresh();
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className="-my-2 -mr-2 size-11 text-muted-foreground"
      aria-label={label}
      disabled={removing}
      onClick={() => void remove()}
    >
      <XIcon aria-hidden="true" />
    </Button>
  );
};

type AddNoteInlineProps = {
  bookmark: Pick<BookmarkResponse, "id" | "sessionId" | "revision" | "anchor">;
};

/** "Add a note" on a clip saved without one. Enter saves. */
export const AddNoteInline = ({ bookmark }: AddNoteInlineProps) => {
  const router = useRouter();
  const inputId = useId();
  const [note, setNote] = useState("");
  // One operation per distinct text, so a resend of the same text is idempotent.
  const [sent, setSent] = useState<{ text: string; operationId: string }>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const text = note.trim();
    if (!text || saving) return;
    const attempt =
      sent?.text === text ? sent : { text, operationId: crypto.randomUUID() };
    setSent(attempt);
    setSaving(true);
    const result = await updateBookmarkNote(
      bookmark,
      text,
      attempt.operationId,
    );
    setSaving(false);
    if (result.kind === "saved") {
      toast.success("Note added");
      router.refresh();
      return;
    }
    toast.error(
      result.kind === "conflict"
        ? "This clip changed elsewhere. Reload to see the latest."
        : "Couldn't add your note. Check your connection and try again.",
    );
  };

  return (
    <form
      className="flex flex-col gap-1.5 border-t pt-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label htmlFor={inputId} className="text-xs text-muted-foreground">
        Add a note
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Why this matters to you…"
          onChange={(event) => setNote(event.target.value)}
          className="h-11 lg:h-9"
        />
        <Button
          type="submit"
          variant="secondary"
          className="h-11 lg:h-9"
          disabled={!note.trim() || saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
};

type ExportNotesButtonProps = {
  title: string;
  bookmarks: BookmarkResponse[];
  iconOnly?: boolean;
};

/** Downloads the attendee's own notes as Markdown, built in the browser. */
export const ExportNotesButton = ({
  title,
  bookmarks,
  iconOnly = false,
}: ExportNotesButtonProps) => {
  const exportNotes = () => {
    const blob = new Blob([notesMarkdown(title, bookmarks)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "my-notes.md";
    link.click();
    URL.revokeObjectURL(url);
  };
  return iconOnly ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className="size-11"
      aria-label="Export notes as Markdown"
      disabled={bookmarks.length === 0}
      onClick={exportNotes}
    >
      <DownloadIcon aria-hidden="true" />
    </Button>
  ) : (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={bookmarks.length === 0}
      onClick={exportNotes}
    >
      <DownloadIcon data-icon="inline-start" />
      Export
    </Button>
  );
};
