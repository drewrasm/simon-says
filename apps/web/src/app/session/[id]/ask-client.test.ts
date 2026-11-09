import { expect, it } from "vitest";
import type { AskEvent } from "@simon-says/contracts/ask";
import { readAskResponse } from "./ask-client";

const streamResponse = (records: string) => {
  const bytes = new TextEncoder().encode(records);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    }),
  );
};
it("reads split UTF-8 and JSON incrementally and validates source metadata", async () => {
  const received: AskEvent[] = [];
  await readAskResponse(
    streamResponse(
      [
        JSON.stringify({
          type: "sources",
          citations: [
            {
              segmentId: "s1",
              startMs: 192000,
              endMs: 195000,
              timestamp: "03:12",
              excerpt: "Synthetic caption",
            },
          ],
        }),
        JSON.stringify({ type: "text", text: "The speaker’s idea [03:12]" }),
        JSON.stringify({ type: "done" }),
        "",
      ].join("\n"),
    ),
    (event) => received.push(event),
  );
  expect(received.map((event) => event.type)).toEqual([
    "sources",
    "text",
    "done",
  ]);
  expect(received[1]).toEqual({
    type: "text",
    text: "The speaker’s idea [03:12]",
  });
});
it.each([
  '{"type":"text","text":"partial"}\n',
  '{"type":"error","message":"Couldn\'t answer. Please try again."}\n',
  '{"type":"sources","citations":[{"startMs":-1}]}\n',
  "not-json\n",
])("rejects errors, malformed and truncated streams", async (records) => {
  await expect(
    readAskResponse(streamResponse(records), () => undefined),
  ).rejects.toThrow();
});
it("rejects unsuccessful HTTP responses", async () => {
  await expect(
    readAskResponse(
      new Response("not_found", { status: 404 }),
      () => undefined,
    ),
  ).rejects.toThrow();
});
