import "server-only";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import type { TranscriptionModel } from "ai";
import { decodeAudioFrame } from "@simon-says/contracts/audio-frame";
import {
  hostIngestMessageSchema,
  serverIngestMessageSchema,
  type IngestRejectReason,
} from "@simon-says/contracts/ingest";
import { CaptionAssembler } from "./assembler";
import { EventHub } from "./event-hub";
import type { IngestAuthority } from "./ingest-authority";
import type { CaptionDelay } from "./openai-window";
import { InMemorySegmentSink, type SegmentSink } from "./segment-sink";
import { WindowManager } from "./window-manager";
import type { CaptionTelemetry } from "./telemetry";

type Session = {
  hub: EventHub;
  epoch: number;
  manager: WindowManager | undefined;
  host: WebSocket | undefined;
};
const route = /^\/api\/sessions\/([A-Za-z0-9._-]{1,200})\/(ingest|events)$/;

/** Product transport shared by the custom server and real-socket offline tests. */
export class CaptionTransport {
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 9616,
    perMessageDeflate: false,
  });
  private readonly sessions = new Map<string, Session>();
  private readonly streams = new Set<ServerResponse>();
  private stopping = false;
  private readonly heartbeat = setInterval(() => {
    for (const session of this.sessions.values())
      session.hub.publish({
        kind: "clock.heartbeat",
        sourceMs: session.manager?.sourceMs ?? 0,
      });
  }, 15000);
  constructor(
    private readonly options: {
      authority: IngestAuthority;
      model?: TranscriptionModel;
      delay?: CaptionDelay;
      sink?: SegmentSink;
      telemetry?: CaptionTelemetry;
      managerConfig?: Pick<
        ConstructorParameters<typeof WindowManager>[0],
        "planner" | "timeoutMs"
      >;
    },
  ) {}

  private session(id: string): Session | undefined {
    let session = this.sessions.get(id);
    if (!session) {
      if (this.sessions.size >= 16) return;
      session = {
        hub: new EventHub(id),
        epoch: 0,
        manager: undefined,
        host: undefined,
      };
      this.sessions.set(id, session);
      if (!this.options.model)
        session.hub.publish({
          kind: "capture.state",
          session: "degraded",
          audio: "stopped",
          captionLagMs: null,
          reason: "missing_provider_key",
        });
    }
    return session;
  }

  handleHttp(req: IncomingMessage, res: ServerResponse): boolean {
    const match = route.exec((req.url ?? "").split("?")[0]!);
    if (!match) return false;
    const id = match[1]!;
    if (!this.options.authority.authorizeMember(id, req)) {
      res.writeHead(403).end();
      return true;
    }
    if (match[2] === "ingest") {
      res.writeHead(426).end();
      return true;
    }
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return true;
    }
    const session = this.session(id);
    if (
      this.stopping ||
      !session ||
      this.streams.size + this.wss.clients.size >= 32
    ) {
      res.writeHead(503).end();
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    this.streams.add(res);
    const lastId = req.headers["last-event-id"];
    const unsubscribe = session.hub.subscribe(
      (event) => {
        try {
          if (
            !res.write(
              `id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`,
            )
          )
            res.destroy();
        } catch {
          // A failed subscriber must not poison sink completion or other readers.
          res.destroy();
        }
      },
      typeof lastId === "string" ? lastId : undefined,
    );
    // Bound idle/lost clients; EventSource reconnects with Last-Event-ID.
    const lifetime = setTimeout(() => res.end(), 30 * 60 * 1000);
    res.once("close", () => {
      clearTimeout(lifetime);
      unsubscribe();
      this.streams.delete(res);
    });
    return true;
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const match = route.exec((req.url ?? "").split("?")[0]!);
    if (!match || match[2] !== "ingest") return false;
    const id = match[1]!;
    const reject = (status: number) =>
      socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
    if (!this.options.authority.authorizeHost(id, req)) {
      reject(403);
      return true;
    }
    const session = this.session(id);
    if (
      this.stopping ||
      !session ||
      this.streams.size + this.wss.clients.size >= 32
    ) {
      reject(503);
      return true;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) =>
      this.connect(ws, session, id),
    );
    return true;
  }

  private connect(ws: WebSocket, session: Session, id: string) {
    let epoch: number | undefined;
    let received = 0;
    const send = (message: unknown) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify(serverIngestMessageSchema.parse(message)));
    };
    const reject = (reason: IngestRejectReason) => {
      send({ type: "rejected", reason, retryable: reason === "overloaded" });
      ws.close(1008, reason);
    };
    const helloTimeout = setTimeout(() => reject("invalid_frame"), 5000);
    const lifetime = setTimeout(
      () => ws.close(1000, "reconnect"),
      30 * 60 * 1000,
    );
    const ack = () => {
      const throughSeq = session.manager?.ackedThroughSeq ?? -1;
      if (epoch !== undefined && received > 0 && throughSeq >= 0) {
        send({ type: "ack", epoch, throughSeq });
        received = 0;
      }
    };
    const interval = setInterval(ack, 500);
    ws.on("error", () => {
      /* Content-bearing provider/transport errors are never logged. */
    });
    ws.on("message", (data, binary) => {
      if (epoch === undefined) {
        if (binary) {
          reject("invalid_frame");
          return;
        }
        let message: unknown;
        try {
          message = JSON.parse(data.toString());
        } catch {
          reject("invalid_frame");
          return;
        }
        const hello = hostIngestMessageSchema.safeParse(message);
        if (!hello.success) {
          reject("invalid_frame");
          return;
        }
        if (
          !this.options.authority.checkEpoch(id, hello.data.epoch) ||
          hello.data.epoch < session.epoch
        ) {
          reject("stale_epoch");
          return;
        }
        if (
          session.host &&
          session.host !== ws &&
          session.host.readyState === WebSocket.OPEN
        ) {
          // Same epoch cannot take over another live host.
          if (hello.data.epoch === session.epoch) {
            reject("stale_epoch");
            return;
          }
          session.host.send(
            JSON.stringify(
              serverIngestMessageSchema.parse({
                type: "rejected",
                reason: "stale_epoch",
                retryable: false,
              }),
            ),
          );
          session.host.close(1008, "stale_epoch");
        }
        if (hello.data.epoch > session.epoch) {
          session.manager?.cancel();
          session.manager = undefined;
          session.epoch = hello.data.epoch;
          if (this.options.model)
            session.manager = new WindowManager({
              ...this.options.managerConfig,
              model: this.options.model,
              assembler: new CaptionAssembler(
                session.hub,
                this.options.sink ?? new InMemorySegmentSink(),
                session.epoch,
              ),
              hub: session.hub,
              epoch: session.epoch,
              ...(this.options.delay ? { delay: this.options.delay } : {}),
              ...(this.options.telemetry
                ? { telemetry: this.options.telemetry }
                : {}),
            });
        }
        epoch = session.epoch;
        session.host = ws;
        clearTimeout(helloTimeout);
        send({
          type: "ready",
          epoch,
          ackedThroughSeq: session.manager?.ackedThroughSeq ?? -1,
        });
        session.hub.publish({
          kind: "capture.state",
          session: this.options.model ? "live" : "degraded",
          audio: "receiving",
          captionLagMs: null,
          ...(!this.options.model
            ? { reason: "missing_provider_key" as const }
            : {}),
        });
        return;
      }
      if (
        session.host !== ws ||
        session.epoch !== epoch ||
        !this.options.authority.checkEpoch(id, epoch)
      ) {
        reject("stale_epoch");
        return;
      }
      if (!binary) {
        reject("invalid_frame");
        return;
      }
      const decoded = decodeAudioFrame(
        new Uint8Array(
          Buffer.concat(
            Array.isArray(data)
              ? data
              : [Buffer.isBuffer(data) ? data : Buffer.from(data)],
          ),
        ),
      );
      if (!decoded.ok) {
        reject("invalid_frame");
        return;
      }
      if (decoded.frame.epoch !== epoch) {
        reject("stale_epoch");
        return;
      }
      if (!session.manager) {
        reject("overloaded");
        return;
      }
      const result = session.manager.push(decoded.frame);
      if (result !== "accepted" && result !== "duplicate") {
        reject(result);
        return;
      }
      received++;
      if (received >= 5) ack();
    });
    ws.once("close", () => {
      clearTimeout(helloTimeout);
      clearTimeout(lifetime);
      clearInterval(interval);
      if (session.host === ws) {
        session.host = undefined;
        // Keep uncommitted audio/windows alive for same-epoch resend; provider deadlines bound them.
        session.hub.publish({
          kind: "capture.state",
          session: "degraded",
          audio: "stalled",
          captionLagMs: null,
        });
      }
    });
  }

  close() {
    this.stopping = true;
    clearInterval(this.heartbeat);
    for (const session of this.sessions.values()) session.manager?.cancel();
    for (const res of this.streams) res.end();
    for (const ws of this.wss.clients) ws.terminate();
    this.wss.close();
  }
}
