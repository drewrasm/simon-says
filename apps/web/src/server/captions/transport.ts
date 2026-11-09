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
      membershipRecheckMs?: number;
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

  async handleHttp(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const match = route.exec((req.url ?? "").split("?")[0]!);
    if (!match) return false;
    const id = match[1]!;
    if (
      !(await this.authorized(() =>
        this.options.authority.authorizeMember(id, req),
      ))
    ) {
      res.writeHead(404).end();
      return true;
    }
    if (res.destroyed) return true;
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
    const stopChecking = this.recheck(
      () => this.options.authority.authorizeMember(id, req),
      () => res.destroy(),
    );
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
      stopChecking();
      clearTimeout(lifetime);
      subscriber.close();
      unsubscribe();
      this.streams.delete(res);
    });
    return true;
  }

  async handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<boolean> {
    const match = route.exec((req.url ?? "").split("?")[0]!);
    if (!match || match[2] !== "ingest") return false;
    const id = match[1]!;
    const reject = (status: number) =>
      socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
    const allowed = await this.authorized(() =>
      this.options.authority.authorizeHost(id, req),
    );
    if (socket.destroyed) return true;
    const session = allowed ? this.session(id) : undefined;
    if (
      this.stopping ||
      (allowed && !session) ||
      this.streams.size + this.wss.clients.size >= 32
    ) {
      reject(503);
      return true;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      if (!allowed || !session) {
        ws.on("error", () => {
          /* No content-bearing transport errors in logs. */
        });
        ws.send(
          JSON.stringify({
            type: "rejected",
            reason: "unauthorized",
            retryable: false,
          }),
        );
        ws.close(1008, "unauthorized");
        const deadline = setTimeout(() => ws.terminate(), 1000);
        ws.once("close", () => clearTimeout(deadline));
        return;
      }
      this.connect(ws, session, id, req);
    });
    return true;
  }

  private connect(
    ws: WebSocket,
    session: Session,
    id: string,
    req: IncomingMessage,
  ) {
    let denied = false;
    let epoch: number | undefined;
    let received = 0;
    const send = (message: unknown) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify(serverIngestMessageSchema.parse(message)));
    };
    let rejectDeadline: ReturnType<typeof setTimeout> | undefined;
    const reject = (reason: IngestRejectReason) => {
      if (denied) return;
      denied = true;
      send({ type: "rejected", reason, retryable: reason === "overloaded" });
      ws.close(1008, reason);
      rejectDeadline = setTimeout(() => ws.terminate(), 1000);
    };
    const stopChecking = this.recheck(
      () => this.options.authority.authorizeHost(id, req),
      () => reject("unauthorized"),
    );
    const helloTimeout = setTimeout(() => reject("invalid_frame"), 5000);
    const lifetime = setTimeout(
      () => ws.close(1012, "reconnect"),
      30 * 60 * 1000,
    );
    const ack = () => {
      if (denied) return;
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
      if (denied || ws.readyState !== WebSocket.OPEN) return;
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
    ws.once("close", (code) => {
      stopChecking();
      clearTimeout(rejectDeadline);
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

  /** A stalled access backend must not keep a connection authorized indefinitely. */
  private async authorized(check: () => boolean | Promise<boolean>) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(check),
        new Promise<false>((resolve) => {
          timeout = setTimeout(() => resolve(false), 5000);
        }),
      ]);
    } catch {
      // Access/backend failures visibly deny admission or close an existing stream.
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** One check at a time; cancellation prevents late results from restarting timers. */
  private recheck(
    check: () => boolean | Promise<boolean>,
    revoked: () => void,
  ) {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      const allowed = await this.authorized(check);
      if (stopped) return;
      if (!allowed) {
        stopped = true;
        revoked();
      } else schedule();
    };
    const schedule = () => {
      timer = setTimeout(
        () => void run(),
        this.options.membershipRecheckMs ?? 30000,
      );
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
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
