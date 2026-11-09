"use client";

import { useMemo, useState } from "react";
import { saveNote, type NoteDraft } from "./save-note";
import { createSessionClock } from "./talk-time";

export const NOTE_MAX_LENGTH = 4_000;

const FAILURE_MESSAGE = {
  rejected:
    "This note couldn't be saved. You may no longer have access to this session.",
  error: "Couldn't save your note. Check your connection and try again.",
} as const;

type UseNoteDraftOptions = { sessionId: string; elapsedAtRenderMs: number };

/**
 * Draft state shared by the note sheet and the inline note form. A draft is
 * pinned to the session clock once, keeps its IDs across retries so a resend
 * is idempotent, and resets after a successful save.
 */
export const useNoteDraft = ({
  sessionId,
  elapsedAtRenderMs,
}: UseNoteDraftOptions) => {
  const readClock = useMemo(
    () => createSessionClock(elapsedAtRenderMs),
    [elapsedAtRenderMs],
  );
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [note, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<keyof typeof FAILURE_MESSAGE | null>(
    null,
  );

  /** Pins the draft to now, unless it is already pinned. */
  const pin = () =>
    setDraft(
      (current) =>
        current ?? {
          bookmarkId: crypto.randomUUID(),
          operationId: crypto.randomUUID(),
          sessionId,
          markedAtMs: readClock(),
        },
    );

  const setNote = (value: string) => {
    setNoteText(value);
    if (value.trim()) pin();
  };

  /** Drops an empty draft so the next one re-pins to a fresh moment. */
  const discardIfEmpty = () => {
    if (!note.trim()) setDraft(null);
  };

  /** Saves the draft; resolves true once saved. */
  const submit = async () => {
    const text = note.trim();
    if (!draft || !text || saving) return false;
    setSaving(true);
    setFailure(null);
    const result = await saveNote(draft, text);
    setSaving(false);
    if (result.kind !== "saved") {
      setFailure(result.kind);
      return false;
    }
    setDraft(null);
    setNoteText("");
    return true;
  };

  return {
    draft,
    note,
    setNote,
    pin,
    discardIfEmpty,
    submit,
    saving,
    canSubmit: Boolean(draft && note.trim()) && !saving,
    failureMessage: failure ? FAILURE_MESSAGE[failure] : null,
  };
};
