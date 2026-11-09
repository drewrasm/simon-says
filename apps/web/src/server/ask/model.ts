import "server-only";

import { openai } from "@ai-sdk/openai";
import { streamText, wrapLanguageModel } from "ai";
import type { SearchResult } from "@simon-says/contracts/search";
import { askInstructions, buildAskPrompt } from "./prompt";

export const streamAnswer = (options: {
  question: string;
  passages: SearchResult[];
  abortSignal: AbortSignal;
}) =>
  streamText({
    model: wrapLanguageModel({
      model: openai(process.env.RECAP_MODEL || "gpt-5.4-mini"),
      middleware: {
        // Provider warnings can include arbitrary text. Suppress them locally,
        // before the SDK's default warning logger sees them.
        wrapStream: async ({ doStream }) => {
          const result = await doStream();
          return {
            ...result,
            stream: result.stream.pipeThrough(
              new TransformStream({
                transform(part, controller) {
                  controller.enqueue(
                    part.type === "stream-start"
                      ? { ...part, warnings: [] }
                      : part,
                  );
                },
              }),
            ),
          };
        },
      },
    }),
    instructions: askInstructions,
    prompt: buildAskPrompt(options.question, options.passages),
    abortSignal: options.abortSignal,
    maxRetries: 0,
    maxOutputTokens: 1_000,
    providerOptions: { openai: { store: false } },
    telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    // The SDK's default callback logs provider errors, which can contain input.
    onError: () => undefined,
  });
