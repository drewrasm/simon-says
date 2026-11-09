// @vitest-environment happy-dom

import { act, cloneElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCaptionFeed, type CaptionFeed } from "./caption-feed";
import { useClipState } from "./clip-context";
import SessionPage from "./page";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  putBookmark: vi.fn(),
  stream: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));
vi.mock("@/server/access/errors", () => ({
  AccessError: class extends Error {},
}));
vi.mock("@/server/access/principal", () => ({
  readPrincipal: async () => ({ id: "p1" }),
}));
vi.mock("@/server/access/membership", () => ({
  requireMembership: async () => ({
    principalId: "p1",
    session: { title: "Keynote", status: "live" },
  }),
}));
vi.mock("@/server/bookmarks/service", () => ({
  listBookmarks: async () => ({ bookmarks: [] }),
}));
vi.mock("./use-caption-stream", () => ({
  useCaptionStream: mocks.stream,
}));
vi.mock("./bookmark-client", () => ({ putBookmark: mocks.putBookmark }));

const line = {
  segmentId: "seg-1",
  revision: 2,
  startMs: 30_000,
  endMs: 35_000,
  text: "Keep this idea.",
};
const feed: CaptionFeed = {
  ...emptyCaptionFeed,
  lines: [{ ...line, kind: "final", key: "s:seg-1", windowId: "w1" }],
};

const ClipProbe = () => {
  const { lines, selectedIds, talkMs } = useClipState();
  return <output>{JSON.stringify({ lines, selectedIds, talkMs })}</output>;
};

let container: HTMLDivElement;
let root: Root;

const button = (label: string) => {
  const match = [...container.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const mountPage = async () => {
  const page = await SessionPage({ params: Promise.resolve({ id: "s1" }) });
  await act(async () => {
    root.render(
      cloneElement(page, undefined, page.props.children, <ClipProbe />),
    );
  });
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.refresh.mockReset();
  mocks.putBookmark.mockReset();
  mocks.stream.mockReturnValue({ feed, status: "open", retry: vi.fn() });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("attendee session clip wiring", () => {
  it("reports finalized lines and enables Clip last 30s before selection", async () => {
    await mountPage();
    expect(
      JSON.parse(container.querySelector("output")?.textContent ?? ""),
    ).toEqual({
      lines: [line],
      selectedIds: [],
      talkMs: line.endMs,
    });
    expect(button("Clip last 30s").disabled).toBe(false);
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });

  it("selects a caption, saves straight to notes on desktop, and clears selection", async () => {
    mocks.putBookmark.mockResolvedValue({ kind: "saved" });
    await mountPage();
    const caption = button("00:00:30Keep this idea.");
    await click(caption);
    expect(caption.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[role="toolbar"]')?.textContent).toContain(
      "1 line selected",
    );
    await click(button("Clip to notes"));
    expect(mocks.putBookmark).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        sessionId: "s1",
        anchor: {
          kind: "paragraph",
          segmentId: line.segmentId,
          segmentRevision: line.revision,
          range: { startMs: line.startMs, endMs: line.endMs },
        },
      }),
      expect.any(Function),
    );
    expect(caption.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("waits for finalized captions rather than enabling clipping for interim text", async () => {
    mocks.stream.mockReturnValue({
      feed: {
        ...emptyCaptionFeed,
        interim: [{ windowId: "w1", startMs: 0, text: "Still speaking" }],
      },
      status: "open",
      retry: vi.fn(),
    });
    await mountPage();
    expect(button("Clip last 30s").disabled).toBe(true);
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });
});

describe("Ask in the session panel", () => {
  const fillQuestion = async (value: string) => {
    const input = container.querySelector("#ask-question");
    if (!(input instanceof HTMLTextAreaElement))
      throw new Error("Missing composer");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  };
  const ask = async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        [
          JSON.stringify({
            type: "sources",
            citations: [
              {
                segmentId: line.segmentId,
                startMs: line.startMs,
                endMs: line.endMs,
                timestamp: "00:30",
                excerpt: line.text,
              },
            ],
          }),
          JSON.stringify({
            type: "text",
            text: "Synthetic answer [00:30] and unsupported [99:99].",
          }),
          JSON.stringify({ type: "done" }),
          "",
        ].join("\n"),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await mountPage();
    await click(button("Ask"));
    const input = await fillQuestion("What was the idea?");
    await act(async () =>
      input.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    return { fetcher, input };
  };

  it("opens the existing panel, renders grounded chips and saves the answer with citations", async () => {
    mocks.putBookmark
      .mockResolvedValueOnce({ kind: "error" })
      .mockResolvedValueOnce({ kind: "saved" });
    const { fetcher, input } = await ask();
    expect(container.querySelectorAll("aside")).toHaveLength(1);
    expect(
      container.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent,
    ).toBe("Ask");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/sessions/s1/ask",
      expect.objectContaining({
        body: JSON.stringify({ question: "What was the idea?" }),
      }),
    );
    expect(input.value).toBe("");
    expect(container.textContent).toContain(
      "Read 1 line · 00:00:30 – 00:00:35",
    );
    expect(container.textContent).toContain("Whole talk, up to 00:00:35");
    expect(container.querySelector('a[href="#t=30000"]')?.textContent).toBe(
      "00:00:30",
    );
    expect(container.querySelector('a[href="#t=6039000"]')).toBeNull();
    expect(container.textContent).not.toContain("Ask a follow-up");
    await click(button("Save to notes"));
    expect(container.textContent).toContain("Couldn’t save. Try again.");
    await click(button("Save to notes"));
    expect(mocks.putBookmark).toHaveBeenCalledTimes(2);
    expect(mocks.putBookmark.mock.calls[0]).toEqual(
      mocks.putBookmark.mock.calls[1],
    );
    expect(mocks.putBookmark).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        anchor: {
          kind: "paragraph",
          segmentId: line.segmentId,
          segmentRevision: line.revision,
          range: { startMs: line.startMs, endMs: line.endMs },
        },
        note: "Synthetic answer [00:30] and unsupported [99:99].\n\n00:00:30 — /session/s1#t=30000",
      }),
      expect.any(Function),
    );
    expect(button("Saved").disabled).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("starts a new chat and restores keyboard focus to the composer", async () => {
    await ask();
    const reset = container.querySelector('button[aria-label="New chat"]');
    if (!(reset instanceof HTMLButtonElement))
      throw new Error("Missing New chat");
    await click(reset);
    expect(container.textContent).not.toContain("Synthetic answer");
    expect(container.querySelector("#ask-question")).toBe(
      document.activeElement,
    );
    const back = container.querySelector(
      'button[aria-label="Back to transcript"]',
    );
    if (!(back instanceof HTMLButtonElement)) throw new Error("Missing back");
    await click(back);
    expect(
      container.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent,
    ).toBe("My notes");
    expect(button("Ask")).toBe(document.activeElement);
  });
});
