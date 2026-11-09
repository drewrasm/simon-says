import "server-only";
import type { CaptionEvent } from "@simon-says/contracts/caption";

/** One bounded queue per reader. A false write accepted that whole frame; wait for drain. */
export class SseSubscriber {
  private queue: string[] = [];
  private bytes = 0;
  private blocked = false;
  private closed = false;
  constructor(
    private readonly response: {
      write(frame: string): boolean;
      destroy(): void;
      on(event: "drain" | "close", listener: () => void): unknown;
      off(event: "drain" | "close", listener: () => void): unknown;
      readonly writableLength: number;
    },
    private readonly maxBytes = 8 * 1024 * 1024,
  ) {
    response.on("drain", this.drain);
    response.on("close", this.close);
  }

  enqueue(events: readonly CaptionEvent[]) {
    if (this.closed) return;
    const frames: string[] = [];
    let bytes = 0;
    // Preflight the whole replay/snapshot batch so overflow emits none of that batch.
    for (const event of events) {
      const frame = `id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`;
      bytes += Buffer.byteLength(frame);
      if (this.bytes + this.response.writableLength + bytes > this.maxBytes) {
        this.close();
        this.response.destroy();
        return;
      }
      frames.push(frame);
    }
    this.queue.push(...frames);
    this.bytes += bytes;
    this.flush();
  }

  private flush() {
    try {
      while (!this.closed && !this.blocked && this.queue.length) {
        const frame = this.queue.shift()!;
        this.bytes -= Buffer.byteLength(frame);
        this.blocked = !this.response.write(frame);
      }
    } catch {
      this.close();
      this.response.destroy();
    }
  }

  private readonly drain = () => {
    this.blocked = false;
    this.flush();
  };

  readonly close = () => {
    this.closed = true;
    this.queue = [];
    this.bytes = 0;
    this.response.off("drain", this.drain);
    this.response.off("close", this.close);
  };
}
