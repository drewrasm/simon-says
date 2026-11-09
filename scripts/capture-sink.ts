/** Local-only protocol sink; no persistence, auth, transcription, or content logs. */
import { WebSocketServer } from "ws";
import {
  decodeAudioFrame,
  FRAME_SAMPLES,
} from "@simon-says/contracts/audio-frame";
import { ingestHelloSchema } from "@simon-says/contracts/ingest";

const server = new WebSocketServer({
  host: "127.0.0.1",
  port: 8787,
  maxPayload: 16_384,
});
console.log(
  "Capture sink listening on ws://127.0.0.1:8787 (local verification only)",
);
server.on("connection", (socket) => {
  let epoch: number | undefined;
  let previousSeq = -1;
  let previousOffset = -FRAME_SAMPLES;
  let count = 0;
  let invalid = 0;
  const started = performance.now();
  socket.on("message", (bytes, binary) => {
    if (!binary) {
      let message: unknown;
      try {
        message = JSON.parse(bytes.toString());
      } catch {
        socket.close(1002);
        return;
      }
      const hello = ingestHelloSchema.safeParse(message);
      if (!hello.success) {
        socket.close(1002);
        return;
      }
      epoch = hello.data.epoch;
      socket.send(
        JSON.stringify({ type: "ready", epoch, ackedThroughSeq: -1 }),
      );
      return;
    }
    const decoded = decodeAudioFrame(
      Array.isArray(bytes)
        ? new Uint8Array(Buffer.concat(bytes))
        : new Uint8Array(bytes),
    );
    if (!decoded.ok || decoded.frame.epoch !== epoch) {
      invalid++;
      socket.close(1002);
      return;
    }
    const frame = decoded.frame;
    if (
      frame.seq !== previousSeq + 1 ||
      frame.sampleOffset !== previousOffset + FRAME_SAMPLES ||
      frame.samples.length !== FRAME_SAMPLES
    )
      invalid++;
    previousSeq = frame.seq;
    previousOffset = frame.sampleOffset;
    count++;
    socket.send(JSON.stringify({ type: "ack", epoch, throughSeq: frame.seq }));
  });
  socket.on("close", () => {
    console.log(
      JSON.stringify({
        frames: count,
        framesPerSecond: +(
          count /
          ((performance.now() - started) / 1000)
        ).toFixed(2),
        lastSeq: previousSeq,
        lastSampleOffset: previousOffset,
        invalid,
      }),
    );
  });
});
