"use client";

import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { Button } from "@simon-says/ui/components/button";
import { Input } from "@simon-says/ui/components/input";
import { CopyIcon, DownloadIcon, Share2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { deleteBookmark, updateBookmarkNote } from "../bookmark-client";
import { NOTE_MAX_LENGTH } from "../use-note-draft";
import { notesMarkdown } from "./notes-markdown";
import { notesPlainText } from "./notes-plain-text";

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

const subscribeNothing = () => () => {};
const canShareOnDevice = () => typeof navigator.share === "function";
const noShareOnServer = () => false;

type NotesExportActionsProps = {
  title: string;
  bookmarks: BookmarkResponse[];
};

/**
 * Copy, share (only where the device offers the share sheet), and download the
 * attendee's own notes. Everything is built in the browser; nothing is sent.
 */
export const NotesExportActions = ({
  title,
  bookmarks,
}: NotesExportActionsProps) => {
  const canShare = useSyncExternalStore(
    subscribeNothing,
    canShareOnDevice,
    noShareOnServer,
  );
  const empty = bookmarks.length === 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(notesPlainText(title, bookmarks));
      toast.success("Copied as text");
    } catch {
      toast.error("Couldn't copy. Try Download instead.");
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title: `My notes: ${title}`,
        text: notesPlainText(title, bookmarks),
      });
    } catch (error) {
      // Cancelling the share sheet is not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn't open sharing. Try Copy instead.");
    }
  };

  const download = () => {
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 lg:h-9"
          disabled={empty}
          onClick={() => void copy()}
        >
          <CopyIcon data-icon="inline-start" />
          Copy as text
        </Button>
        {canShare ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 lg:h-9"
            disabled={empty}
            onClick={() => void share()}
          >
            <Share2Icon data-icon="inline-start" />
            Share
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 lg:h-9"
          disabled={empty}
          onClick={download}
        >
          <DownloadIcon data-icon="inline-start" />
          Download .md
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Copied, shared, or downloaded notes leave this device.
      </p>
    </div>
  );
};
