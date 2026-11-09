import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import next from "next";
import { WebSocketServer } from "ws";
import { createOpenAI } from "@ai-sdk/openai";
import { CaptionTransport } from "../src/server/captions/transport";
import { DevIngestAuthority } from "../src/server/captions/ingest-authority";
import { readRuntimeEnv } from "./env.js";

const runtime = readRuntimeEnv(process.env);
const { port, probeToken } = runtime;
const captions = new CaptionTransport({
  authority: new DevIngestAuthority(
    runtime.captionsDevSession,
    process.env.NODE_ENV === "production",
  ),
  delay: runtime.captionDelay,
  ...(runtime.openaiApiKey &&
  runtime.captionsDevSession &&
  process.env.NODE_ENV !== "production"
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
const conf = dev
  ? undefined
  : JSON.parse(await readFile(".next/required-server-files.json", "utf8"))
      .config;
const app = next({ dev, ...(conf ? { conf } : {}) });
const handle = app.getRequestHandler();
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

const server = createServer((req, res) => {
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
  if (captions.handleHttp(req, res)) return;
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
server.on("upgrade", (req, socket, head) => {
  const path = (req.url ?? "/").split("?", 1)[0] ?? "/";
  if (dev && ready && !stopping && path.startsWith("/_next/")) {
    void app.getUpgradeHandler()(req, socket, head);
    return;
  }
  if (ready && !stopping && captions.handleUpgrade(req, socket, head)) return;
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
function shutdown(exitCode: number) {
  if (stopping) return;
  stopping = true;
  captions.close();
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
  server.close(() => {
    wss.close(() => {
      void app
        .close()
        .then(() => {
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
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
server.listen(port, "0.0.0.0", () => console.log(`HTTP listening on ${port}`));
try {
  await app.prepare();
  if (!stopping) ready = true;
  console.log("Next prepared");
} catch {
  console.error("Next preparation failed");
  shutdown(1);
}
