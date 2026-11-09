import { askEventSchema, type AskEvent } from "@simon-says/contracts/ask";

/** Validate records after framing, since network chunks can split JSON or UTF-8. */
export async function readAskResponse(
  response: Response,
  receive: (event: AskEvent) => void,
) {
  if (!response.ok || !response.body) throw new Error("ask_failed");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      if (pending.length > 128_000) throw new Error("invalid_stream");
      let newline;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        const event = askEventSchema.parse(JSON.parse(line));
        if (event.type === "error") throw new Error("ask_failed");
        if (event.type === "done") finished = true;
        receive(event);
      }
    }
    if (!finished || pending.trim()) throw new Error("incomplete_stream");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
