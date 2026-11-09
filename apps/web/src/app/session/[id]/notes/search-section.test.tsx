import type { SearchResponse } from "@simon-says/contracts/search";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchOutcome, type SearchState } from "./search-section";

const passage = {
  passageId: "seg-4:2",
  segmentId: "seg-4",
  segmentRevision: 2,
  range: { startMs: 61_000, endMs: 66_500 },
  excerpt: "Latency budgets belong to the whole pipeline.",
};

const render = (state: SearchState) =>
  renderToStaticMarkup(
    <SearchOutcome
      state={state}
      saved={new Set()}
      savingId={undefined}
      onSave={() => {}}
    />,
  );

const done = (response: Partial<SearchResponse>) =>
  render({
    kind: "done",
    response: {
      results: [],
      nextCursor: null,
      indexingState: "current",
      ...response,
    },
  });

const NO_MATCHES = "No matching passages yet.";
const CATCHING_UP = "The last few captions are still being indexed.";
const UNAVAILABLE = "Search is unavailable right now. Captions keep running.";
const FAILED = "Search didn&#x27;t respond. Captions keep running; try again.";

describe("search outcome", () => {
  it("announces every outcome in a polite live region", () => {
    expect(render({ kind: "idle" })).toMatch(/^<div aria-live="polite"/);
  });

  it("lists the passages found", () => {
    const html = done({ results: [passage] });

    expect(html).toContain(passage.excerpt);
    expect(html).not.toContain(NO_MATCHES);
  });

  it("says when nothing matched", () => {
    const html = done({});

    expect(html).toContain(NO_MATCHES);
    expect(html).not.toContain(CATCHING_UP);
    expect(html).not.toContain(UNAVAILABLE);
  });

  it("warns that recent captions are still being indexed", () => {
    const html = done({ results: [passage], indexingState: "catching_up" });

    expect(html).toContain(CATCHING_UP);
    expect(html).toContain(passage.excerpt);
  });

  it("reports unavailable search without claiming there were no matches", () => {
    const html = done({ indexingState: "unavailable" });

    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain(NO_MATCHES);
  });

  it("reports a request that failed", () => {
    const html = render({ kind: "failed" });

    expect(html).toContain(FAILED);
    expect(html).not.toContain(NO_MATCHES);
  });
});
