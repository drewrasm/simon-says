import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { askEventSchema } from "@simon-says/contracts/ask";
import { AccessError } from "../access/errors";
import { askSession, searchQueryFor } from "./service";
import { streamAnswer } from "./model";

const { openai, doStream } = vi.hoisted(() => ({
  openai: vi.fn(),
  doStream: vi.fn(),
}));
vi.mock("@ai-sdk/openai", () => ({ openai }));

const question = "PRIVATE_QUESTION_7af1";
const answer = "PRIVATE_ANSWER_4b31 [03:12]";
const excerpt = "PRIVATE_PASSAGE_6d82";
const passage = {
  passageId: "p1",
  segmentId: "seg1",
  segmentRevision: 2,
  range: { startMs: 192000, endMs: 195000 },
  excerpt,
};
const options = () => ({
  sessionId: "s1",
  principalId: "p1",
  question,
  history: [],
  signal: new AbortController().signal,
});
const deps = () => ({
  requireMembership: vi.fn().mockResolvedValue({}),
  searchSession: vi.fn().mockResolvedValue({
    results: [passage],
    indexingState: "current",
    nextCursor: null,
  }),
  streamAnswer,
  startAskSpan: vi.fn(() => vi.fn()),
});
const events = async (response: Response) =>
  (await response.text())
    .trim()
    .split("\n")
    .map((line) => askEventSchema.parse(JSON.parse(line)));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RECAP_MODEL", "");
  openai.mockImplementation(() => new MockLanguageModelV4({ doStream }));
  doStream.mockResolvedValue({
    stream: simulateReadableStream({
      chunks: [
        {
          type: "stream-start",
          warnings: [
            { type: "other", message: `${question} ${answer} ${excerpt}` },
          ],
        },
        { type: "text-start", id: "1" },
        { type: "text-delta", id: "1", delta: answer.slice(0, 8) },
        { type: "text-delta", id: "1", delta: answer.slice(8) },
        { type: "text-end", id: "1" },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
        },
      ],
    }),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("streams a real AI SDK fake-model answer with trusted source metadata", async () => {
  const dependencies = deps();
  const warning = vi.spyOn(process, "emitWarning");
  const response = await askSession(options(), dependencies);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-accel-buffering")).toBe("no");
  const received = await events(response);
  expect(received[0]).toEqual({
    type: "sources",
    citations: [
      {
        segmentId: "seg1",
        startMs: 192000,
        endMs: 195000,
        excerpt,
        timestamp: "03:12",
      },
    ],
  });
  expect(
    received
      .filter((event) => event.type === "text")
      .map((event) => event.text)
      .join(""),
  ).toBe(answer);
  expect(received.at(-1)).toEqual({ type: "done" });
  expect(dependencies.searchSession).toHaveBeenCalledWith({
    sessionId: "s1",
    principalId: "p1",
    request: { query: question, limit: 8 },
  });
  expect(warning).not.toHaveBeenCalled();
  warning.mockRestore();
  expect(openai).toHaveBeenCalledWith("gpt-5.4-mini");
  const call = doStream.mock.calls[0]?.[0];
  expect(call.providerOptions.openai.store).toBe(false);
  expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  expect(call.prompt).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "user",
        content: [{ type: "text", text: expect.stringContaining(excerpt) }],
      }),
    ]),
  );
});

it.each([
  ["current", "That hasn't come up yet."],
  ["unavailable", "Search is unavailable. Please try again."],
])(
  "%s search with no passages makes no model call",
  async (indexingState, text) => {
    const dependencies = deps();
    dependencies.searchSession.mockResolvedValue({
      results: [],
      indexingState,
      nextCursor: null,
    });
    expect(await events(await askSession(options(), dependencies))).toEqual([
      { type: "sources", citations: [] },
      { type: "text", text },
      { type: "done" },
    ]);
    expect(openai).not.toHaveBeenCalled();
    expect(doStream).not.toHaveBeenCalled();
  },
);
it("never generates even if unavailable search includes stale results", async () => {
  const dependencies = deps();
  dependencies.searchSession.mockResolvedValue({
    results: [passage],
    indexingState: "unavailable",
    nextCursor: null,
  });
  await events(await askSession(options(), dependencies));
  expect(doStream).not.toHaveBeenCalled();
});
it("checks membership before search or the model", async () => {
  const dependencies = deps();
  dependencies.requireMembership.mockRejectedValue(
    new AccessError(404, "not_found"),
  );
  await expect(askSession(options(), dependencies)).rejects.toMatchObject({
    status: 404,
  });
  expect(dependencies.searchSession).not.toHaveBeenCalled();
  expect(doStream).not.toHaveBeenCalled();
});
it("preserves search's post-retrieval authorization denial", async () => {
  const dependencies = deps();
  dependencies.searchSession.mockRejectedValue(
    new AccessError(404, "not_found"),
  );
  await expect(askSession(options(), dependencies)).rejects.toMatchObject({
    status: 404,
  });
  expect(doStream).not.toHaveBeenCalled();
});
it("stops waiting after a second and never generates from late search", async () => {
  vi.useFakeTimers();
  const dependencies = deps();
  let resolveSearch: (value: unknown) => void = () => undefined;
  dependencies.searchSession.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
  );
  const pending = askSession(options(), dependencies);
  await vi.advanceTimersByTimeAsync(1_100);
  const received = await events(await pending);
  expect(received).toContainEqual({
    type: "text",
    text: "Search is unavailable. Please try again.",
  });
  resolveSearch({
    results: [passage],
    indexingState: "current",
    nextCursor: null,
  });
  await vi.runAllTicks();
  expect(doStream).not.toHaveBeenCalled();
});
it("honors the existing RECAP_MODEL override", async () => {
  vi.stubEnv("RECAP_MODEL", "gpt-5.4");
  await events(await askSession(options(), deps()));
  expect(openai).toHaveBeenCalledWith("gpt-5.4");
});
it("returns a content-free stream error and never logs provider errors", async () => {
  const logs = [
    vi.spyOn(console, "error"),
    vi.spyOn(console, "warn"),
    vi.spyOn(console, "log"),
  ];
  try {
    doStream.mockRejectedValue(new Error(`${question} ${answer} ${excerpt}`));
    const received = await events(await askSession(options(), deps()));
    expect(received.at(-1)).toEqual({
      type: "error",
      message: "Couldn't answer. Please try again.",
    });
    expect(JSON.stringify(received)).not.toContain(question);
    expect(JSON.stringify(received)).not.toContain(answer);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  } finally {
    for (const log of logs) log.mockRestore();
  }
});

it("cancels the provider on a disconnected request without exporting its reason", async () => {
  const controller = new AbortController();
  const dependencies = deps();
  doStream.mockImplementation(async ({ abortSignal }) => ({
    stream: new ReadableStream({
      start(stream) {
        stream.enqueue({ type: "text-start", id: "1" });
        abortSignal.addEventListener(
          "abort",
          () => stream.error(new Error(question)),
          { once: true },
        );
        controller.abort(question);
      },
    }),
  }));
  const received = await events(
    await askSession({ ...options(), signal: controller.signal }, dependencies),
  );
  expect(received.at(-1)?.type).toBe("error");
  expect(JSON.stringify(received)).not.toContain(question);
  expect(dependencies.startAskSpan.mock.results[0]?.value).toHaveBeenCalledWith(
    "cancelled",
    1,
  );
});

it("exports only the four allowed ask attributes for a complete fake-model flow", async () => {
  const { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } =
    await import("@opentelemetry/sdk-trace");
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { ContentSafeSpanProcessor } = await import("../telemetry/runtime");
  const { CAPTION_SCOPE } = await import("../telemetry/captions");
  const { startAskSpan } = await import("./telemetry");
  const exporter = new InMemorySpanExporter();
  const resource = resourceFromAttributes({ "service.name": "simon-says" });
  const provider = new TracerProvider({
    resource,
    spanProcessors: [
      new ContentSafeSpanProcessor(
        new SimpleSpanProcessor({ exporter }),
        resource,
      ),
    ],
  });
  const tracer = provider.getTracer(CAPTION_SCOPE);
  try {
    await events(
      await askSession(options(), {
        ...deps(),
        startAskSpan: (id) => startAskSpan(id, tracer),
      }),
    );
    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("ask");
    expect(spans[0]?.attributes).toEqual({
      session_id: "s1",
      outcome: "success",
      passage_count: 1,
      duration_ms: expect.any(Number),
    });
    expect(spans[0]?.events).toEqual([]);
    const { inspect } = await import("node:util");
    const serialized = inspect(spans, { depth: 20 });
    for (const privateText of [
      question,
      answer,
      excerpt,
      "Answer the question",
    ])
      expect(serialized).not.toContain(privateText);
  } finally {
    await provider.shutdown();
  }
});

it("bounds a stalled membership read by the overall fifteen-second deadline", async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      ms,
    );
    return controller.signal;
  });
  const dependencies = deps();
  dependencies.requireMembership.mockImplementation(
    () => new Promise(() => undefined),
  );
  try {
    const rejected = expect(
      askSession(options(), dependencies),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(dependencies.searchSession).not.toHaveBeenCalled();
    expect(doStream).not.toHaveBeenCalled();
    expect(
      dependencies.startAskSpan.mock.results[0]?.value,
    ).toHaveBeenCalledWith("cancelled", 0);
  } finally {
    timeout.mockRestore();
  }
});

it("searches with the previous question too when both fit the query limit", () => {
  const history = [
    { role: "user" as const, text: "What is the main idea?" },
    { role: "assistant" as const, text: "Ship small." },
  ];
  expect(searchQueryFor("Why?", history)).toBe("What is the main idea? Why?");
  expect(searchQueryFor("Why?", [])).toBe("Why?");
  expect(
    searchQueryFor("Why?", [{ role: "user", text: "x".repeat(500) }]),
  ).toBe("Why?");
});
