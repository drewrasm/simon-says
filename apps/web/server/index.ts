import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import next, { type NextConfig } from "next";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { CaptionTransport } from "../src/server/captions/transport";
import { startTelemetry } from "../src/server/telemetry/runtime";
import { FrameTransport } from "../src/server/frames/transport";
import { createIngestAuthority } from "../src/server/captions/access-authority";
import { elasticsearchClient } from "../src/server/search/es-client";
import { ElasticsearchSegmentSink } from "../src/server/search/elasticsearch-segment-sink";
import { ElasticsearchObservationSink } from "../src/server/search/elasticsearch-observation-sink";
import {
  createFrameUpload,
  InMemoryObservationSink,
} from "../src/server/frames/upload";
import { createFrameAccess } from "../src/server/frames/access-authority";
import { s3FrameStore } from "../src/server/frames/s3";
import { readRuntimeEnv } from "./env.js";

const runtime = readRuntimeEnv(process.env);
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const telemetry = startTelemetry(process.env, version);
const { port, probeToken } = runtime;
const elasticsearch = runtime.elasticsearch;
const authority = createIngestAuthority(process.env);
const captions = new CaptionTransport({
  ...(telemetry ? { telemetry: telemetry.record } : {}),
  authority,
  ...(elasticsearch
    ? {
        sink: {
          writeSegments: (segments) =>
            new ElasticsearchSegmentSink(
              elasticsearchClient(elasticsearch),
              telemetry?.record,
            ).writeSegments(segments),
        },
      }
    : { sinkDegradedReason: "missing_elasticsearch_config" }),
  delay: runtime.captionDelay,
  reconnectGraceMs: runtime.captionReconnectGraceMs,
  ...(runtime.openaiApiKey &&
  (process.env.DATABASE_URL ||
    (runtime.captionsDevSession && process.env.NODE_ENV !== "production"))
    ? {
        model: createOpenAI({ apiKey: runtime.openaiApiKey }).transcription(
          runtime.captionModel,
        ),
      }
    : {}),
});
const dev = process.argv.includes("--dev");
// Read Next's built configuration: runtime needs neither TS config compilation
// nor standalone's unrelated server.js. This Node entry point is bundled separately.
const requiredServerFiles = z.object({
  config: z.custom<NextConfig>(
    (value) =>
      typeof value === "object" && value !== null && !Array.isArray(value),
  ),
});
const conf = dev
  ? undefined
  : requiredServerFiles.parse(
      JSON.parse(await readFile(".next/required-server-files.json", "utf8")),
    ).config;
const app = next({ dev, port, ...(conf ? { conf } : {}) });
const handle = app.getRequestHandler();
const frames = new FrameTransport(
  runtime.frameEnv,
  new URL(`http://localhost:${port}`).origin,
  () =>
    createFrameUpload({
      access: createFrameAccess(
        runtime.frameEnv,
        new URL(`http://localhost:${port}`).origin,
        authority,
      ),
      store: s3FrameStore(runtime.frameEnv),
      sink: elasticsearch
        ? {
            put: (observation) =>
              new ElasticsearchObservationSink(
                elasticsearchClient(elasticsearch),
              ).put(observation),
          }
        : new InMemoryObservationSink(),
      ...(!elasticsearch
        ? { sinkDegradedReason: "missing_elasticsearch_config" }
        : {}),
    }),
  authority,
);
const maxConnections = 16;
const durationMs = 30_000;
const drainMs = 10_000;
const streams = new Set<ServerResponse>();
const sockets = new Set<Socket>();
let ready = false;
let stopping = false;
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 32,
  perMessageDeflate: false,
  handleProtocols: () => "simon-probe",
});

function authorized(candidate: string | undefined) {
  if (!probeToken || !candidate) return false;
  const received = Buffer.from(candidate);
  const expected = Buffer.from(probeToken);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?", 1)[0] ?? "/";
  res.setHeader("Cache-Control", "no-store");
  if (path === "/healthz" || path === "/readyz") {
    res.writeHead(path === "/healthz" || (ready && !stopping) ? 200 : 503);
    res.end(
      path === "/healthz"
        ? "alive\n"
        : ready && !stopping
          ? "ready\n"
          : "not ready\n",
    );
    return;
  }
  if (!ready || stopping) {
    res.writeHead(503).end();
    return;
  }
  if (await captions.handleHttp(req, res)) return;
  if (path === "/api/probe/sse") {
    if (!probeToken) {
      res.writeHead(404).end();
      return;
    }
    if (
      !req.headers.authorization?.startsWith("Bearer ") ||
      !authorized(req.headers.authorization.slice(7))
    ) {
      res.writeHead(401).end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (streams.size + wss.clients.size >= maxConnections) {
      res.writeHead(503).end();
      return;
    }
    // Bypass Next/compression entirely; bounded constant frames contain no input.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-store, no-transform",
    });
    res.flushHeaders();
    streams.add(res);
    const heartbeat = () => {
      if (!res.write(": heartbeat\n\n")) res.destroy();
    };
    heartbeat();
    const interval = setInterval(heartbeat, 1000);
    const timeout = setTimeout(() => res.end(), durationMs);
    res.once("close", () => {
      clearInterval(interval);
      clearTimeout(timeout);
      streams.delete(res);
    });
    return;
  }
  if (path === "/api/probe/ws") {
    res.writeHead(426).end();
    return;
  }
  if (frames.handleHttp(req, res, req.socket.remoteAddress)) return;
  void handle(req, res).catch(() => {
    console.error("HTTP request failed");
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.on("connection", (socket) => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
});
server.on("upgrade", async (req, socket, head) => {
  const path = (req.url ?? "/").split("?", 1)[0] ?? "/";
  if (dev && ready && !stopping && path.startsWith("/_next/")) {
    void app.getUpgradeHandler()(req, socket, head);
    return;
  }
  if (ready && !stopping && (await captions.handleUpgrade(req, socket, head)))
    return;
  const protocols =
    req.headers["sec-websocket-protocol"]?.split(",").map((p) => p.trim()) ??
    [];
  const token = protocols.find((p) => p.startsWith("token."))?.slice(6);
  const status =
    !ready || stopping
      ? 503
      : path !== "/api/probe/ws" || !probeToken
        ? 404
        : !protocols.includes("simon-probe") || !authorized(token)
          ? 401
          : streams.size + wss.clients.size >= maxConnections
            ? 503
            : 101;
  if (status !== 101) {
    socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
    return;
  }
  // Caption upgrades pass through the separately gated authority above.
  wss.handleUpgrade(req, socket, head, (ws) => {
    const timeout = setTimeout(
      () => ws.close(1000, "probe complete"),
      durationMs,
    );
    const forceClose = setTimeout(() => ws.terminate(), durationMs + 1000);
    let messages = 0;
    ws.on("message", (data, binary) => {
      if (binary || data.toString() !== "ping" || ++messages > 30) {
        ws.close(1008, "probe accepts bounded ping only");
        return;
      }
      ws.send("pong");
    });
    ws.on("error", () => console.error("WebSocket probe failed"));
    ws.once("close", () => {
      clearTimeout(timeout);
      clearTimeout(forceClose);
    });
  });
});

/** Fail readiness first, release streams, and bound even stalled HTTP clients. */
async function shutdown(exitCode: number) {
  if (stopping) return;
  stopping = true;
  ready = false;
  console.log("shutdown: draining");
  const deadline = setTimeout(() => {
    for (const ws of wss.clients) ws.terminate();
    for (const socket of sockets) socket.destroy();
    console.error("shutdown: drain deadline reached");
    process.exit(1);
  }, drainMs);
  for (const res of streams) res.end();
  for (const ws of wss.clients) ws.close(1012, "service restart");
  await captions.close(5000);
  server.close(() => {
    wss.close(() => {
      void app
        .close()
        .then(async () => {
          await telemetry?.shutdown(2000);
          clearTimeout(deadline);
          console.log("shutdown: complete");
          process.exit(exitCode);
        })
        .catch(() => {
          console.error("shutdown: Next close failed");
          process.exit(1);
        });
    });
  });
}
process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(0));
server.listen(port, dev ? "127.0.0.1" : "0.0.0.0", () =>
  console.log(`HTTP listening on ${port}`),
);
try {
  await app.prepare();
  if (!stopping) ready = true;
  console.log("Next prepared");
} catch {
  console.error("Next preparation failed");
  void shutdown(1);
}
