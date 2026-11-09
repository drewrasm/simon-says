import "server-only";
import { randomUUID } from "node:crypto";
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
import { SseSubscriber } from "./sse-subscriber";
import { WindowManager } from "./window-manager";
import type { CaptionTelemetry } from "./telemetry";

type Session = {
  hub: EventHub;
  epoch: number;
  manager: WindowManager | undefined;
  host: WebSocket | undefined;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  ended: boolean;
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
  private readonly retiredManagers = new Set<WindowManager>();
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
      reconnectGraceMs?: number;
      finishTimeoutMs?: number;
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
        reconnectTimer: undefined,
        ended: false,
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
    const connectionId = randomUUID();
    this.options.telemetry?.("sse_start", 1, {
      session_id: id,
      connection_id: connectionId,
    });
    const lastId = req.headers["last-event-id"];
    const subscriber = new SseSubscriber(res);
    const unsubscribe = session.hub.subscribeBatch(
      (events) => subscriber.enqueue(events),
      typeof lastId === "string" ? lastId : undefined,
    );
    if (res.destroyed) unsubscribe();
    // Bound idle/lost clients; EventSource reconnects with Last-Event-ID.
    const lifetime = setTimeout(() => res.end(), 30 * 60 * 1000);
    res.once("close", () => {
      clearTimeout(lifetime);
      subscriber.close();
      unsubscribe();
      this.streams.delete(res);
      this.options.telemetry?.("sse_end", 1, {
        session_id: id,
        connection_id: connectionId,
      });
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
    const connectionId = randomUUID();
    this.options.telemetry?.("ingest_start", 1, {
      session_id: id,
      connection_id: connectionId,
    });
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
      () => ws.close(1012, "reconnect"),
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
        if (hello.data.epoch === session.epoch && session.ended) {
          reject("session_ended");
          return;
        }
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = undefined;
        if (hello.data.epoch > session.epoch) {
          if (session.manager) {
            const retired = session.manager;
            this.retiredManagers.add(retired);
            void retired.finish(this.options.finishTimeoutMs).then(() => {
              this.retiredManagers.delete(retired);
            });
          }
          session.ended = false;
          session.manager = undefined;
          session.epoch = hello.data.epoch;
          const managerEpoch = session.epoch;
          if (this.options.model)
            session.manager = new WindowManager({
              ...this.options.managerConfig,
              model: this.options.model,
              assembler: new CaptionAssembler(
                session.hub,
                this.options.sink ?? new InMemorySegmentSink(),
                session.epoch,
                this.options.telemetry,
              ),
              hub: session.hub,
              epoch: session.epoch,
              ...(this.options.delay ? { delay: this.options.delay } : {}),
              ...(this.options.telemetry
                ? {
                    telemetry: (metric, value, metadata) =>
                      this.options.telemetry?.(metric, value, {
                        session_id: id,
                        window_id: `${managerEpoch}`,
                        ...metadata,
                      }),
                  }
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
    ws.once("close", (code) => {
      this.options.telemetry?.("ingest_end", 1, {
        session_id: id,
        connection_id: connectionId,
      });
      clearTimeout(helloTimeout);
      clearTimeout(lifetime);
      clearInterval(interval);
      if (session.host === ws) {
        session.host = undefined;
        if (this.stopping) return;
        const finish = () => {
          session.reconnectTimer = undefined;
          session.ended = true;
          void session.manager?.finish(this.options.finishTimeoutMs);
        };
        if (code === 1000) finish();
        else
          session.reconnectTimer = setTimeout(
            finish,
            this.options.reconnectGraceMs ?? 10000,
          );
        session.hub.publish({
          kind: "capture.state",
          session: code === 1000 ? "ended" : "degraded",
          audio: code === 1000 ? "stopped" : "stalled",
          captionLagMs: null,
        });
      }
    });
  }

  async close(drainMs = 5000) {
    this.stopping = true;
    clearInterval(this.heartbeat);
    for (const session of this.sessions.values())
      clearTimeout(session.reconnectTimer);
    // Stop new input while keeping SSE open for tail finals/gaps.
    for (const ws of this.wss.clients) ws.terminate();
    await Promise.all(
      [
        ...this.retiredManagers,
        ...[...this.sessions.values()].flatMap((session) =>
          session.manager ? [session.manager] : [],
        ),
      ].map((manager) => manager.finish(drainMs)),
    );
    for (const res of this.streams) res.end();
    this.wss.close();
  }
}
