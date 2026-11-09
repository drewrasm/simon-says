"use client";

import { useState } from "react";
import { draftForAttempt, withFreshIds } from "./note-draft";
import { saveNote, type NoteDraft } from "./save-note";
import { UNPINNED_MARK_MS } from "./talk-time";

export const NOTE_MAX_LENGTH = 4_000;

const FAILURE_MESSAGE = {
  rejected:
    "This note couldn't be saved. You may no longer have access to this session.",
  conflict:
    "An earlier attempt may have saved different text. Save again to keep your latest text as a new note.",
  error: "Couldn't save your note. Check your connection and try again.",
} as const;

const newId = () => crypto.randomUUID();

type UseNoteDraftOptions = { sessionId: string };

/**
 * Draft state shared by the note sheet and the inline note form. A draft
 * keeps its IDs across retries so a resend is idempotent, and resets after a
 * successful save. Notes are unpinned until the capture clock exists.
 */
export const useNoteDraft = ({ sessionId }: UseNoteDraftOptions) => {
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  // Text last sent under the draft's IDs, or null if none was sent yet.
  const [sentText, setSentText] = useState<string | null>(null);
  const [note, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<keyof typeof FAILURE_MESSAGE | null>(
    null,
  );

  /** Starts a draft with new IDs, unless one is already started. */
  const start = () =>
    setDraft(
      (current) =>
        current ?? {
          bookmarkId: newId(),
          operationId: newId(),
          sessionId,
          markedAtMs: UNPINNED_MARK_MS,
        },
    );

  /** Drops the draft and its IDs. */
  const reset = () => {
    setDraft(null);
    setSentText(null);
  };

  const setNote = (value: string) => {
    setNoteText(value);
    if (value.trim()) start();
    else reset();
  };

  /** Drops an empty draft when the sheet closes. */
  const discardIfEmpty = () => {
    if (!note.trim()) reset();
  };

  /** Saves the draft; resolves true once saved. */
  const submit = async () => {
    const text = note.trim();
    if (!draft || !text || saving) return false;
    const attempt = draftForAttempt(draft, sentText, text, newId);
    setDraft(attempt);
    setSentText(text);
    setSaving(true);
    setFailure(null);
    const result = await saveNote(attempt, text);
    setSaving(false);
    if (result.kind !== "saved") {
      // The IDs are taken by other content: the next save uses new ones.
      if (result.kind === "conflict") {
        setDraft(withFreshIds(attempt, newId));
        setSentText(null);
      }
      setFailure(result.kind);
      return false;
    }
    reset();
    setNoteText("");
    return true;
  };

  return {
    draft,
    note,
    setNote,
    start,
    discardIfEmpty,
    submit,
    saving,
    canSubmit: Boolean(draft && note.trim()) && !saving,
    failureMessage: failure ? FAILURE_MESSAGE[failure] : null,
  };
};
