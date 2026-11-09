import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import { ContentSafeSpanProcessor } from "./runtime";
import {
  PRIVATE_SCOPE,
  PRIVATE_SPAN_NAMES,
  safePrivateAttributes,
  tracePrivateHttp,
} from "./private-flow";
import { CAPTION_SCOPE } from "./captions";
import { handlePutBookmark } from "../bookmarks/http";
import { handleSearch } from "../search/http";
import { handleCreateRecap } from "../recaps/http";
import { generateRecap } from "../recaps/service";
import {
  syntheticRecapOutput,
  syntheticRecapSelection,
} from "../recaps/fixtures";
import { AccessError } from "../access/errors";
import { SourceUnavailable } from "../evidence/resolve";
import { RevisionConflict } from "../bookmarks/service";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  search: vi.fn(),
  principal: vi.fn(),
  membership: vi.fn(),
  model: vi.fn(),
  recap: {
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  bookmark: { findMany: vi.fn() },
  transaction: vi.fn(),
}));
vi.mock("../access/principal", () => ({ readPrincipal: mocks.principal }));
vi.mock("../access/membership", () => ({
  requireMembership: mocks.membership,
}));
vi.mock("../access/database", () => ({
  getDatabase: () => ({
    recap: mocks.recap,
    bookmark: mocks.bookmark,
    $transaction: mocks.transaction,
  }),
}));
vi.mock("../bookmarks/service", async (original) => ({
  ...(await original<typeof import("../bookmarks/service")>()),
  putBookmark: mocks.put,
}));
vi.mock("../search/service", () => ({ searchSession: mocks.search }));
vi.mock("../recaps/model", async (original) => ({
  ...(await original<typeof import("../recaps/model")>()),
  generateTakeaways: mocks.model,
}));
vi.mock("next/server", () => ({ after: vi.fn() }));

const marker = "PRIVATE-content-query-note-prompt-secret";
const id = randomUUID();
const selection = syntheticRecapSelection();
const record = {
  id,
  ownerPrincipalId: randomUUID(),
  sessionId: randomUUID(),
  bookmarkSnapshot: [{ bookmarkId: selection.id, expectedRevision: 1 }],
};
let exporter: InMemorySpanExporter;
let provider: TracerProvider;
beforeEach(() => {
  vi.resetAllMocks();
  trace.disable();
  exporter = new InMemorySpanExporter();
  const resource = resourceFromAttributes({ "service.name": "simon-says" });
  provider = new TracerProvider({
    resource,
    spanProcessors: [
      new ContentSafeSpanProcessor(
        new SimpleSpanProcessor({ exporter }),
        resource,
      ),
    ],
  });
  trace.setGlobalTracerProvider(provider);
  mocks.principal.mockResolvedValue({ id: randomUUID() });
  mocks.membership.mockResolvedValue({});
  mocks.recap.updateMany.mockResolvedValue({ count: 1 });
  mocks.recap.findUniqueOrThrow.mockResolvedValue(record);
  mocks.recap.findUnique.mockResolvedValue({
    ...record,
    status: "pending",
  });
  mocks.bookmark.findMany.mockResolvedValue([selection]);
  mocks.transaction.mockImplementation((callback) =>
    callback({ recap: mocks.recap, bookmark: mocks.bookmark }),
  );
  mocks.model.mockResolvedValue(syntheticRecapOutput(selection.id));
});
afterEach(async () => {
  await provider.forceFlush();
  expect(JSON.stringify(exporter.getFinishedSpans())).not.toContain(marker);
  await provider.shutdown();
  trace.disable();
  vi.useRealTimers();
});
const request = (body: unknown) =>
  new Request("http://localhost/private", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const savedBody = {
  sessionId: record.sessionId,
  operationId: randomUUID(),
  expectedRevision: null,
  anchor: { kind: "live", markedAtMs: 0 },
  note: marker,
};
const lastSpan = async () => {
  await provider.forceFlush();
  const spans = exporter.getFinishedSpans();
  expect(spans).toHaveLength(1);
  return spans[0]!;
};

it.each([201, 200, 400, 404, 409, 503, 500] as const)(
  "records bookmark save HTTP %s without content",
  async (status) => {
    if (status < 400)
      mocks.put.mockResolvedValue({ bookmark: { note: marker }, status });
    else if (status === 409)
      mocks.put.mockRejectedValue(
        new RevisionConflict({
          error: "revision_conflict",
          id,
          expectedRevision: null,
          currentRevision: 1,
        }),
      );
    else if (status === 503)
      mocks.put.mockRejectedValue(new SourceUnavailable());
    else
      mocks.put.mockRejectedValue(
        status === 500
          ? new Error(marker)
          : new AccessError(status === 404 ? 404 : 400, "invalid_request"),
      );
    const response = await handlePutBookmark(request(savedBody), id);
    expect(response.status).toBe(status);
    const span = await lastSpan();
    expect(span.name).toBe("bookmark.save");
    expect(span.attributes).toMatchObject({
      outcome: status < 400 ? "success" : "error",
      "http.response.status_code": status,
    });
  },
);

it.each(["current", "unavailable", "denied", "invalid"])(
  "records search %s, including unavailable HTTP 200",
  async (mode) => {
    mocks.search.mockResolvedValue({
      results: [{ excerpt: marker }],
      indexingState: mode,
      nextCursor: null,
    });
    if (mode === "denied")
      mocks.search.mockRejectedValue(new AccessError(404, "not_found"));
    const response = await handleSearch(
      request(mode === "invalid" ? {} : { query: marker }),
      record.sessionId,
    );
    expect(response.status).toBe(
      mode === "denied" ? 404 : mode === "invalid" ? 400 : 200,
    );
    const span = await lastSpan();
    expect(span.name).toBe("search.query");
    expect(span.attributes.outcome).toBe(
      mode === "current" ? "success" : "error",
    );
    if (mode === "unavailable")
      expect(span.attributes.error_code).toBe("source_unavailable");
  },
);

it.each(["created", "retry", "denied", "invalid", "busy"])(
  "records recap creation %s",
  async (mode) => {
    if (mode === "denied")
      mocks.membership.mockRejectedValue(new AccessError(404, "not_found"));
    if (mode === "created" || mode === "busy") {
      mocks.recap.findUnique.mockResolvedValue(null);
      mocks.recap.create.mockResolvedValue({ ...record, status: "pending" });
      mocks.recap.count.mockResolvedValue(0);
      mocks.transaction.mockImplementation((callback) =>
        callback({
          recap: mocks.recap,
          bookmark: mocks.bookmark,
          $executeRaw: vi.fn(),
        }),
      );
    }
    const body = {
      operationId: randomUUID(),
      bookmarks: record.bookmarkSnapshot,
    };
    try {
      if (mode === "busy") {
        for (let count = 0; count < 4; count += 1) {
          expect(
            (await handleCreateRecap(request(body), record.sessionId)).status,
          ).toBe(201);
        }
        exporter.reset();
      }
      const response = await handleCreateRecap(
        request(mode === "invalid" ? {} : body),
        record.sessionId,
      );
      const status =
        mode === "created"
          ? 201
          : mode === "retry"
            ? 200
            : mode === "denied"
              ? 404
              : mode === "busy"
                ? 429
                : 400;
      expect(response.status).toBe(status);
      const span = await lastSpan();
      expect(span.name).toBe("recap.create");
      expect(span.attributes).toEqual({
        operation: "recap.create",
        outcome: status < 400 ? "success" : "error",
        "http.response.status_code": status,
        duration_ms: expect.any(Number),
        ...(status >= 400 ? { error_code: "request_failed" } : {}),
      });
      expect(after).toHaveBeenCalledTimes(
        mode === "created" ? 1 : mode === "busy" ? 4 : 0,
      );
    } finally {
      for (const [task] of vi.mocked(after).mock.calls) {
        if (typeof task === "function") await task();
      }
    }
  },
);

it.each([
  "success",
  "stale",
  "late-stale",
  "empty",
  "invalid-citations",
  "timeout",
  "failure",
  "claim-failure",
  "skipped",
])("records recap generation terminal outcome %s", async (mode) => {
  if (mode === "stale") mocks.bookmark.findMany.mockResolvedValue([]);
  if (mode === "late-stale")
    mocks.bookmark.findMany
      .mockResolvedValueOnce([selection])
      .mockResolvedValue([]);
  if (mode === "empty")
    mocks.bookmark.findMany.mockResolvedValue([
      { ...selection, evidence: { segments: [] } },
    ]);
  if (mode === "invalid-citations")
    mocks.model.mockResolvedValue({ takeaways: [] });
  if (mode === "failure") mocks.model.mockRejectedValue(new Error(marker));
  if (mode === "claim-failure")
    mocks.recap.updateMany.mockRejectedValue(new Error(marker));
  if (mode === "skipped")
    mocks.recap.updateMany.mockResolvedValue({ count: 0 });
  if (mode === "timeout") {
    vi.useFakeTimers();
    mocks.model.mockImplementation(() => new Promise(() => {}));
  }
  const pending = generateRecap(id);
  if (mode === "claim-failure") await expect(pending).rejects.toThrow(marker);
  else {
    if (mode === "timeout") await vi.advanceTimersByTimeAsync(45001);
    await pending;
  }
  const span = await lastSpan();
  expect(span.name).toBe("recap.generate");
  const outcome =
    mode === "success"
      ? "success"
      : mode.includes("stale")
        ? "stale"
        : mode === "skipped"
          ? "skipped"
          : "error";
  expect(span.attributes.outcome).toBe(outcome);
  expect(span.status.code).toBe(
    outcome === "error" ? SpanStatusCode.ERROR : SpanStatusCode.OK,
  );
  const code =
    mode === "empty"
      ? "no_resolved_evidence"
      : mode === "invalid-citations"
        ? "no_valid_citations"
        : mode === "timeout"
          ? "generation_timeout"
          : mode.endsWith("failure")
            ? "generation_failed"
            : undefined;
  expect(span.attributes.error_code).toBe(code);
});

it("finishes an unexpected rejected operation and preserves the exception", async () => {
  await expect(
    tracePrivateHttp("bookmark.save", async () => {
      throw new Error(marker);
    }),
  ).rejects.toThrow(marker);
  expect((await lastSpan()).attributes).toMatchObject({
    outcome: "error",
    error_code: "request_failed",
  });
});

it("rebuilds private exports and rejects names used under the wrong scope", async () => {
  const tracer = provider.getTracer(PRIVATE_SCOPE);
  for (const name of PRIVATE_SPAN_NAMES) {
    const span = tracer.startSpan(name, {
      attributes: {
        operation: name,
        outcome: "success",
        session_id: marker,
        note: marker,
        duration_ms: 1,
        error_code: marker,
      },
    });
    span.recordException(new Error(marker));
    span.addEvent(marker);
    span.addLink({
      context: span.spanContext(),
      attributes: { content: marker },
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message: marker });
    span.end();
  }
  provider.getTracer(CAPTION_SCOPE).startSpan("bookmark.save").end();
  tracer.startSpan("caption.window").end();
  provider.getTracer(marker).startSpan("bookmark.save").end();
  await provider.forceFlush();
  const spans = exporter.getFinishedSpans();
  expect(spans.map((span) => span.name)).toEqual([...PRIVATE_SPAN_NAMES]);
  for (const span of spans) {
    expect(span.attributes).toEqual({
      operation: span.name,
      outcome: "success",
      duration_ms: 1,
    });
    expect(span.events).toEqual([]);
    expect(span.links).toEqual([]);
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR });
  }
  expect(
    safePrivateAttributes({
      duration_ms: -1,
      "http.response.status_code": Infinity,
      operation: marker,
      outcome: marker,
      retry_count: 2,
    }),
  ).toEqual({});
});
