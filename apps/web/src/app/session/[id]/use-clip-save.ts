"use client";

import { useState } from "react";
import type { ClipLine } from "./clip-line";
import {
  saveClip,
  savedCount,
  startClip,
  type ClipDraft,
  type SaveClipResult,
} from "./save-clip";

const newId = () => crypto.randomUUID();

const FAILURE_MESSAGE = {
  rejected:
    "This clip couldn't be saved. A line may have been corrected since you selected it, or you no longer have access to this session.",
  conflict: "An earlier attempt saved different content. Try clipping again.",
  error: "Couldn't save your clip. Check your connection and try again.",
} as const;

type Failure = Exclude<SaveClipResult["kind"], "saved">;

/** Two attempts with equal keys send the same content. */
const keyFor = (lines: readonly ClipLine[], note: string) =>
  JSON.stringify([
    note,
    lines.map(({ segmentId, revision }) => [segmentId, revision]),
  ]);

const lineSet = (lines: readonly ClipLine[]) =>
  lines
    .map(({ segmentId, revision }) => `${segmentId}@${revision}`)
    .sort()
    .join(",");

/**
 * Whether a save should continue the existing draft. A retry with the same
 * lines and note always does. A partly saved draft is finished unless the
 * caller allows a new selection (`finishLocked: false`) and the lines differ.
 */
export const reuseDraft = ({
  draft,
  sentKey,
  key,
  lines,
  finishLocked,
}: {
  draft: ClipDraft;
  sentKey: string | null;
  key: string;
  lines: readonly ClipLine[];
  finishLocked: boolean;
}) => {
  if (sentKey === key) return true;
  if (savedCount(draft) === 0) return false;
  return (
    finishLocked ||
    lineSet(draft.parts.map(({ line }) => line)) === lineSet(lines)
  );
};

/**
 * Saves a clip of selected lines. A retry of the same lines and note reuses
 * their IDs; once some lines are saved, the clip is locked to finish them.
 */
export const useClipSave = ({ sessionId }: { sessionId: string }) => {
  const [draft, setDraft] = useState<ClipDraft | null>(null);
  const [sentKey, setSentKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const partlySaved = draft ? savedCount(draft) > 0 : false;

  const reset = () => {
    setDraft(null);
    setSentKey(null);
    setFailure(null);
  };

  /**
   * Saves the clip; resolves to the number of lines saved, or null. With
   * `finishLocked: false` (desktop, where the selection can change after a
   * failure), a different selection starts a new clip instead of silently
   * finishing the locked one.
   */
  const save = async (
    lines: readonly ClipLine[],
    note: string,
    { finishLocked = true }: { finishLocked?: boolean } = {},
  ) => {
    if (saving || lines.length === 0) return null;
    const key = keyFor(lines, note);
    const attempt =
      draft && reuseDraft({ draft, sentKey, key, lines, finishLocked })
        ? draft
        : startClip(sessionId, lines, newId);
    setDraft(attempt);
    setSentKey(key);
    setSaving(true);
    setFailure(null);
    const result = await saveClip(attempt, note);
    setSaving(false);
    if (result.kind === "saved") {
      reset();
      return result.draft.parts.length;
    }
    // A conflict means these IDs hold other content: start over next time.
    if (result.kind === "conflict" && savedCount(result.draft) === 0) {
      setDraft(null);
      setSentKey(null);
    } else {
      setDraft(result.draft);
    }
    setFailure(result.kind);
    return null;
  };

  const progress =
    draft && partlySaved
      ? `Saved ${savedCount(draft)} of ${draft.parts.length} lines. Try again to save the rest.`
      : null;

  return {
    save,
    saving,
    reset,
    /** True once some lines are saved: the lines and note can't change. */
    locked: partlySaved,
    /** The lines being finished after a partial save. */
    lockedLines:
      draft && partlySaved ? draft.parts.map(({ line }) => line) : null,
    failureMessage: failure
      ? [FAILURE_MESSAGE[failure], progress].filter(Boolean).join(" ")
      : null,
  };
};
