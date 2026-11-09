"use client";

import { createContext, useContext } from "react";

/** A finalized caption line the attendee selected, on the session source clock. */
export type SelectedCaptionLine = {
  segmentId: string;
  revision: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type CaptionSelection = {
  /** Selected lines in source-clock order; empty when nothing is selected. */
  lines: readonly SelectedCaptionLine[];
  clear: () => void;
  /**
   * Latest source-clock time received from the caption stream, in session
   * milliseconds; null until the first caption or heartbeat arrives.
   */
  sourceMs: number | null;
};

const fallback: CaptionSelection = {
  lines: [],
  clear: () => undefined,
  sourceMs: null,
};

export const CaptionSelectionContext =
  createContext<CaptionSelection>(fallback);

/**
 * Read the reader's line selection and live source clock from any client
 * component rendered inside `CaptionReader` (its `actions` or `notesPanel`
 * slots), for example a Clip or Note button.
 */
export const useCaptionSelection = () => useContext(CaptionSelectionContext);
