import "server-only";
import { experimental_streamTranscribe, type TranscriptionModel } from "ai";

export type CaptionDelay = "minimal" | "low" | "medium" | "high" | "xhigh";

/** Injectable model: tests use ai/test's MockTranscriptionModelV4, never a provider connection. */
export function openProviderWindow(
  model: TranscriptionModel,
  audio: ReadableStream<Uint8Array>,
  abortSignal: AbortSignal,
  delay: CaptionDelay = "low",
) {
  return experimental_streamTranscribe({
    model,
    audio,
    abortSignal,
    inputAudioFormat: { type: "audio/pcm", rate: 24000 },
    providerOptions: { openai: { language: "en", streaming: { delay } } },
  }).fullStream;
}
