import { ROOT_CONTEXT, trace, type Tracer } from "@opentelemetry/api";
import { CAPTION_SCOPE, safeAttributes } from "../telemetry/captions";

export const startAskSpan = (
  sessionId: string,
  tracer: Tracer = trace.getTracer(CAPTION_SCOPE),
) => {
  const started = performance.now();
  const span = tracer.startSpan(
    "ask",
    { attributes: safeAttributes({ session_id: sessionId }) },
    ROOT_CONTEXT,
  );
  let ended = false;
  return (outcome: "success" | "error" | "cancelled", passageCount: number) => {
    if (ended) return;
    ended = true;
    span.setAttributes(
      safeAttributes({
        outcome,
        duration_ms: performance.now() - started,
        passage_count: passageCount,
      }),
    );
    span.end();
  };
};
