import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateTakeaways } from "./model";
import { syntheticRecapOutput } from "./fixtures";

vi.mock("server-only", () => ({}));
const { doGenerate, openai } = vi.hoisted(() => ({
  doGenerate: vi.fn(),
  openai: vi.fn(),
}));
vi.mock("@ai-sdk/openai", async () => {
  const { MockLanguageModelV4 } = await import("ai/test");
  openai.mockImplementation(() => new MockLanguageModelV4({ doGenerate }));
  return { openai };
});
const bookmarkId = randomUUID();
const output = syntheticRecapOutput(bookmarkId);
const passages = [
  {
    bookmarkId,
    segmentId: "synthetic-selected-segment",
    segmentRevision: 2,
    text: "Synthetic selected text",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  doGenerate.mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify(output) }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 20, text: 20, reasoning: undefined },
    },
    warnings: [],
  });
  vi.stubEnv("RECAP_MODEL", "");
});
afterEach(() => vi.unstubAllEnvs());

it("uses real AI SDK structured output with its mock provider and a supported default", async () => {
  expect(
    await generateTakeaways({
      passages,
      abortSignal: new AbortController().signal,
    }),
  ).toEqual(output);
  expect(openai).toHaveBeenCalledWith("gpt-5.4-mini");
  expect(doGenerate).toHaveBeenCalledOnce();
  const call = doGenerate.mock.calls[0]?.[0];
  expect(call.responseFormat.type).toBe("json");
  expect(call.providerOptions.openai.store).toBe(false);
  expect(call.prompt).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "user",
        content: [{ type: "text", text: JSON.stringify(passages) }],
      }),
    ]),
  );
});

it("honors the server-only model override", async () => {
  vi.stubEnv("RECAP_MODEL", "gpt-5.4");
  await generateTakeaways({
    passages,
    abortSignal: new AbortController().signal,
  });
  expect(openai).toHaveBeenCalledWith("gpt-5.4");
});

it("rejects malformed structured model output", async () => {
  doGenerate.mockResolvedValue({
    content: [{ type: "text", text: '{"takeaways":[{"text":"unsupported"}]}' }],
    finishReason: { unified: "stop", raw: undefined },
    usage: { inputTokens: {}, outputTokens: {} },
    warnings: [],
  });
  await expect(
    generateTakeaways({ passages, abortSignal: new AbortController().signal }),
  ).rejects.toThrow();
});
