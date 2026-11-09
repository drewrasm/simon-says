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
