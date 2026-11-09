import type { AskCitation } from "@simon-says/contracts/ask";
import { formatTalkTime } from "./talk-time";

export const askProvenance = (citations: AskCitation[]) => {
  if (!citations.length) return null;
  const count = new Set(citations.map(({ segmentId }) => segmentId)).size;
  const start = Math.min(...citations.map(({ startMs }) => startMs));
  const end = Math.max(...citations.map(({ endMs }) => endMs));
  return `Read ${count} ${count === 1 ? "line" : "lines"} · ${formatTalkTime(start)} – ${formatTalkTime(end)}`;
};

/** Keep the complete answer and source links in the existing plain-text note. */
export const askNoteText = (
  sessionId: string,
  answer: string,
  citations: AskCitation[],
) =>
  [
    answer,
    ...citations.map(
      (citation) =>
        `${formatTalkTime(citation.startMs)} — /session/${sessionId}#t=${Math.floor(citation.startMs)}`,
    ),
  ].join("\n\n");
