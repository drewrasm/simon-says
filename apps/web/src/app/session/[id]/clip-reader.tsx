"use client";

import { useCallback, type ComponentProps } from "react";
import { CaptionReader } from "./caption-reader";
import type { SelectedCaptionLine } from "./caption-selection";
import { useClipState } from "./clip-context";
import type { ClipLine } from "./clip-line";

type ClipReaderProps = Pick<
  ComponentProps<typeof CaptionReader>,
  "sessionId" | "title" | "status" | "noteCount" | "notesPanel" | "actions"
>;

/** Connects the attendee reader to the shared clip and note controls. */
export const ClipReader = (props: ClipReaderProps) => {
  const { selectedIds, setSelectedIds, setLines } = useClipState();
  const reportLines = useCallback(
    (lines: SelectedCaptionLine[]) => {
      const clipLines: ClipLine[] = lines.map(
        ({ segmentId, revision, startMs, endMs, text }) => ({
          segmentId,
          revision,
          startMs,
          endMs,
          text,
        }),
      );
      setLines(clipLines);
    },
    [setLines],
  );

  return (
    <CaptionReader
      {...props}
      selectable
      selectedIds={selectedIds}
      onSelectedIdsChange={setSelectedIds}
      onLinesChange={reportLines}
    />
  );
};
