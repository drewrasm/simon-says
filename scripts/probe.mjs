// Content-free transport check; Node 22's global WebSocket, no provider SDK.
import assert from "node:assert/strict";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:8080");
const token = process.env.PROBE_TOKEN;
assert.ok(token, "Set PROBE_TOKEN to the server's probe token");
for (const path of ["/healthz", "/readyz", "/"]) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  console.log(`${path}: 200`);
}
assert.equal((await fetch(new URL("/api/probe/sse", base))).status, 401);
const controller = new AbortController();
const deadline = setTimeout(() => controller.abort(), 6000);
try {
  const response = await fetch(new URL("/api/probe/sse", base), {
    headers: { Authorization: `Bearer ${token}`, "Accept-Encoding": "gzip" },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assert.equal(response.headers.get("content-encoding"), null);
  let frames = 0;
  const started = Date.now();
  let pending = "";
  for await (const chunk of response.body) {
    pending += new TextDecoder().decode(chunk);
    while (pending.includes("\n\n")) {
      const end = pending.indexOf("\n\n");
      assert.equal(pending.slice(0, end), ": heartbeat");
      pending = pending.slice(end + 2);
      console.log(`SSE heartbeat at ${Date.now() - started}ms`);
      frames++;
    }
    if (frames >= 3) break;
  }
  assert.ok(frames >= 3, "three incremental heartbeats");
  assert.ok(Date.now() - started >= 1500, "heartbeats streamed over time");
} finally {
  controller.abort();
  clearTimeout(deadline);
}
const wsURL = new URL("/api/probe/ws", base);
wsURL.protocol = base.protocol === "https:" ? "wss:" : "ws:";
await new Promise((resolve, reject) => {
  const ws = new WebSocket(wsURL, ["simon-probe", `token.${token}`]);
  const timer = setTimeout(() => {
    ws.close();
    reject(new Error("WS timeout"));
  }, 5000);
  ws.onopen = () => ws.send("ping");
  ws.onerror = () => {
    clearTimeout(timer);
    reject(new Error("WS failed"));
  };
  ws.onmessage = (event) => {
    clearTimeout(timer);
    try {
      assert.equal(event.data, "pong");
      console.log("WebSocket: ping → pong");
      ws.close();
      resolve();
    } catch (error) {
      ws.close();
      reject(error);
    }
  };
});
