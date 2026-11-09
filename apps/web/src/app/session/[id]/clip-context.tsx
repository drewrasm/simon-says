"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { latestTalkMs, type ClipLine } from "./clip-line";

type ClipState = {
  /** Finalized caption lines the reader has shown, latest revision each. */
  lines: ClipLine[];
  /** Segment IDs the attendee selected in the transcript. */
  selectedIds: string[];
  /** Where captions have reached on the source clock, or null before any. */
  talkMs: number | null;
  /** The reader reports its finalized lines here. */
  setLines: (lines: ClipLine[]) => void;
  /** The reader reports selection changes here. */
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;
};

const ClipContext = createContext<ClipState | null>(null);

/**
 * Shares the reader's finalized lines and selection with the clip and note
 * controls, which live outside the reader. Until the reader reports lines,
 * clipping shows its waiting state and notes stay unpinned.
 */
export const ClipProvider = ({ children }: { children: ReactNode }) => {
  const [lines, setLines] = useState<ClipLine[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const value = useMemo<ClipState>(
    () => ({
      lines,
      selectedIds,
      talkMs: latestTalkMs(lines),
      setLines,
      setSelectedIds,
      clearSelection: () => setSelectedIds([]),
    }),
    [lines, selectedIds],
  );
  return <ClipContext.Provider value={value}>{children}</ClipContext.Provider>;
};

const outsideProvider: ClipState = {
  lines: [],
  selectedIds: [],
  talkMs: null,
  setLines: () => {},
  setSelectedIds: () => {},
  clearSelection: () => {},
};

/** The shared clip state; outside a provider, nothing to clip and no talk time. */
export const useClipState = () => useContext(ClipContext) ?? outsideProvider;
