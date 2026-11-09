import "server-only";

import type { AskEvent } from "@simon-says/contracts/ask";
import { requireMembership } from "../access/membership";
import { searchSession } from "../search/service";
import { streamAnswer } from "./model";
import { formatCitationTime } from "./prompt";
import { startAskSpan } from "./telemetry";

type AskOptions = {
  sessionId: string;
  principalId: string;
  question: string;
  signal: AbortSignal;
};
const dependencies = {
  requireMembership,
  searchSession,
  streamAnswer,
  startAskSpan,
};

/** Bound the wait without changing the shared search service. A timed-out
 * search may finish its existing three-second request; it cannot start a model. */
async function withinBudget<T>(operation: Promise<T>, signal: AbortSignal) {
  signal.throwIfAborted();
  let abort: () => void = () => undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export async function askSession(options: AskOptions, deps = dependencies) {
  const finish = deps.startAskSpan(options.sessionId);
  const cancellation = new AbortController();
  const overall = AbortSignal.any([
    options.signal,
    cancellation.signal,
    AbortSignal.timeout(15_000),
  ]);
  let count = 0;
  try {
    overall.throwIfAborted();
    await withinBudget(deps.requireMembership(options), overall);
    overall.throwIfAborted();
    let found;
    const searchSignal = AbortSignal.any([overall, AbortSignal.timeout(1_000)]);
    try {
      found = await withinBudget(
        deps.searchSession({
          sessionId: options.sessionId,
          principalId: options.principalId,
          request: { query: options.question, limit: 8 },
        }),
        searchSignal,
      );
    } catch (error) {
      // Preserve authorization errors; only the search wait timeout degrades.
      if (searchSignal.aborted && !overall.aborted) {
        found = { indexingState: "unavailable", results: [] };
      } else throw error;
    }
    overall.throwIfAborted();
    const passages = found.results.slice(0, 8);
    count = passages.length;
    const citations = passages.map((passage) => ({
      segmentId: passage.segmentId,
      ...passage.range,
      excerpt: passage.excerpt,
      timestamp: formatCitationTime(passage.range.startMs),
    }));
    const fallback =
      found.indexingState === "unavailable"
        ? "Search is unavailable. Please try again."
        : passages.length === 0
          ? "That hasn't come up yet."
          : null;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: AskEvent) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          send({ type: "sources", citations: fallback ? [] : citations });
          if (fallback) {
            send({ type: "text", text: fallback });
          } else {
            let completed = false;
            let hasText = false;
            for await (const part of deps.streamAnswer({
              question: options.question,
              passages,
              abortSignal: overall,
            }).stream) {
              overall.throwIfAborted();
              if (part.type === "text-delta") {
                hasText ||= part.text.trim().length > 0;
                send({ type: "text", text: part.text });
              }
              if (part.type === "error" || part.type === "abort")
                throw new Error("answer_failed");
              if (part.type === "finish") completed = true;
            }
            if (!completed || !hasText) throw new Error("answer_incomplete");
          }
          send({ type: "done" });
          finish(
            found.indexingState === "unavailable" ? "error" : "success",
            count,
          );
        } catch {
          finish(overall.aborted ? "cancelled" : "error", count);
          if (!cancellation.signal.aborted)
            send({
              type: "error",
              message: "Couldn't answer. Please try again.",
            });
        } finally {
          if (!cancellation.signal.aborted) controller.close();
        }
      },
      cancel() {
        cancellation.abort();
        finish("cancelled", count);
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    finish(overall.aborted ? "cancelled" : "error", count);
    throw error;
  }
}
