"use client";

import type { BookmarkAnchor } from "@simon-says/contracts/bookmark";
import { useState } from "react";
import { paragraphAnchor, type ClipLine } from "./clip-line";
import { attemptKey, draftForAttempt, withFreshIds } from "./note-draft";
import { saveNote, type NoteDraft } from "./save-note";
import { UNPINNED_MARK_MS } from "./talk-time";

export const NOTE_MAX_LENGTH = 4_000;

const FAILURE_MESSAGE = {
  rejected:
    "This note couldn't be saved. You may no longer have access to this session, or the attached line was corrected.",
  conflict:
    "An earlier attempt may have saved different text. Save again to keep your latest text as a new note.",
  error: "Couldn't save your note. Check your connection and try again.",
} as const;

const newId = () => crypto.randomUUID();

type UseNoteDraftOptions = {
  sessionId: string;
  /**
   * Where captions have reached on the source clock, or null before the
   * capture clock is known. A draft is pinned to the value when it starts.
   */
  talkMs?: number | null;
};

const liveAnchor = (talkMs: number | null | undefined): BookmarkAnchor => ({
  kind: "live",
  markedAtMs: talkMs ?? UNPINNED_MARK_MS,
});

/**
 * Draft state shared by the note sheet and the inline note form. A draft
 * keeps its IDs across retries so a resend is idempotent, and resets after a
 * successful save. Without a talk time, notes are unpinned (see
 * `UNPINNED_MARK_MS`). An attached line saves the note as a paragraph mark on
 * that line instead.
 */
export const useNoteDraft = ({ sessionId, talkMs }: UseNoteDraftOptions) => {
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  // Content last sent under the draft's IDs, or null if none was sent yet.
  const [sentKey, setSentKey] = useState<string | null>(null);
  const [attached, setAttached] = useState<ClipLine | null>(null);
  const [note, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<keyof typeof FAILURE_MESSAGE | null>(
    null,
  );

  /** Starts a draft with new IDs, pinned to now, unless one is already started. */
  const start = () =>
    setDraft(
      (current) =>
        current ?? {
          bookmarkId: newId(),
          operationId: newId(),
          sessionId,
          anchor: liveAnchor(talkMs),
        },
    );

  /** Drops the draft and its IDs. */
  const reset = () => {
    setDraft(null);
    setSentKey(null);
    setAttached(null);
  };

  const setNote = (value: string) => {
    setNoteText(value);
    if (value.trim()) start();
    else if (!attached) reset();
  };

  /** Drops an empty draft when the sheet closes. */
  const discardIfEmpty = () => {
    if (!note.trim()) {
      reset();
      setFailure(null);
    }
  };

  /** Saves the draft; resolves true once saved. */
  const submit = async () => {
    const text = note.trim();
    if (!draft || !text || saving) return false;
    const pinned =
      draft.anchor.kind === "live" ? draft.anchor : liveAnchor(talkMs);
    const anchor = attached ? paragraphAnchor(attached) : pinned;
    const key = attemptKey(text, anchor);
    const attempt = { ...draftForAttempt(draft, sentKey, key, newId), anchor };
    setDraft(attempt);
    setSentKey(key);
    setSaving(true);
    setFailure(null);
    const result = await saveNote(attempt, text);
    setSaving(false);
    if (result.kind !== "saved") {
      // The IDs are taken by other content: the next save uses new ones.
      if (result.kind === "conflict") {
        setDraft(withFreshIds(attempt, newId));
        setSentKey(null);
      }
      setFailure(result.kind);
      return false;
    }
    reset();
    setNoteText("");
    return true;
  };

  const pinnedAtMs =
    draft?.anchor.kind === "live"
      ? draft.anchor.markedAtMs
      : (talkMs ?? UNPINNED_MARK_MS);

  return {
    draft,
    note,
    setNote,
    start,
    discardIfEmpty,
    submit,
    saving,
    /** The line to quote under the note, or null for a plain note. */
    attached,
    setAttached,
    /** The talk time the note will be pinned to, or null while unpinned. */
    pinnedAtMs: pinnedAtMs === UNPINNED_MARK_MS ? null : pinnedAtMs,
    canSubmit: Boolean(draft && note.trim()) && !saving,
    failureMessage: failure ? FAILURE_MESSAGE[failure] : null,
  };
};
