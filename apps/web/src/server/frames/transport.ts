import "server-only";
import type { IncomingMessage, ServerResponse } from "node:http";
import { s3FrameStore } from "./s3";
import {
  createFrameUpload,
  devFrameAccess,
  InMemoryObservationSink,
} from "./upload";

type Environment = Readonly<Record<string, string | undefined>>;
type Upload = ReturnType<typeof createFrameUpload>;
const route = /^\/api\/sessions\/([^/]+)\/frames$/;

function localUpload(env: Environment, expectedOrigin: string): Upload {
  return createFrameUpload({
    access: devFrameAccess(env, expectedOrigin),
    store: s3FrameStore(env),
    sink: new InMemoryObservationSink(),
  });
}

/** Node-owned route, ahead of Next; shares one upload handler's reservations. */
export class FrameTransport {
  private upload: Upload | undefined;
  constructor(
    private readonly env: Environment,
    private readonly expectedOrigin: string,
    private readonly createUpload: () => Upload = () =>
      localUpload(env, expectedOrigin),
  ) {}

  handleHttp(
    req: IncomingMessage,
    res: ServerResponse,
    remoteAddress: string | undefined,
  ): boolean {
    const match = route.exec((req.url ?? "").split("?", 1)[0]!);
    if (!match) return false;
    res.setHeader("Cache-Control", "no-store");
    // Fail closed before initializing storage, including with dev opt-in set.
    if (this.env.NODE_ENV === "production" || !this.env.CAPTIONS_DEV_SESSION) {
      res.writeHead(404).end();
      return true;
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.writeHead(405).end();
      return true;
    }
    void this.respond(req, res, match[1]!, remoteAddress);
    return true;
  }

  private async respond(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId: string,
    remoteAddress: string | undefined,
  ): Promise<void> {
    try {
      this.upload ??= this.createUpload();
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
        else if (value !== undefined) headers.set(name, value);
      }
      // Cancelling an oversized body must still allow the 413 response to reach
      // the client. Drain unread input instead of destroying its HTTP socket.
      const iterator = req.iterator({ destroyOnReturn: false });
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await iterator.next();
            if (done) controller.close();
            else if (value instanceof Uint8Array) controller.enqueue(value);
            else controller.error(new Error("Invalid request body"));
          } catch (error) {
            controller.error(error);
          }
        },
        async cancel() {
          await iterator.return?.();
          req.resume();
        },
      });
      const init = { method: "POST", headers, body, duplex: "half" };
      const request = new Request(
        new URL(req.url ?? "/", this.expectedOrigin),
        init,
      );
      const response = await this.upload(request, sessionId, remoteAddress);
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.writeHead(response.status);
      res.end(Buffer.from(await response.arrayBuffer()));
      req.resume();
    } catch {
      if (!res.headersSent) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "frame_service_unavailable" }));
      } else res.end();
      req.resume();
    }
  }
}
