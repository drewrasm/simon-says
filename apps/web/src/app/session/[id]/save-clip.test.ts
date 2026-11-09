import { describe, expect, it } from "vitest";
import type { ClipLine } from "./clip-line";
import { saveClip, savedCount, startClip } from "./save-clip";

const sessionId = "6f1c1f7e-3d0e-4c1e-9a7a-2f5b8c6d9e01";
const line = (n: number, startMs: number): ClipLine => ({
  segmentId: `seg-${n}`,
  revision: 2,
  startMs,
  endMs: startMs + 5_000,
  text: `Line ${n}.`,
});

const uuid = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
};

const savedBody = (url: string, body: { anchor: unknown; note?: string }) => ({
  id: url.split("/").at(-1),
  sessionId,
  revision: 1,
  anchor: body.anchor,
  requestedRange: { startMs: 0, endMs: 0 },
  actualRange: null,
  clockUncertaintyMs: 0,
  completeness: "pending",
  evidence: { segments: [] },
  note: body.note ?? null,
  createdAt: "2026-11-09T20:13:24.000Z",
  updatedAt: "2026-11-09T20:13:24.000Z",
});

describe("saveClip", () => {
  it("saves one paragraph bookmark per line, with the note on the first", async () => {
    const sent: { url: string; body: { anchor: unknown; note?: string } }[] =
      [];
    const draft = startClip(
      sessionId,
      [line(2, 10_000), line(1, 5_000)],
      uuid(),
    );
    const result = await saveClip(
      draft,
      "Why it matters",
      async (input, init) => {
        const body = JSON.parse(String(init?.body));
        sent.push({ url: String(input), body });
        return Response.json(savedBody(String(input), body));
      },
    );
    expect(result.kind).toBe("saved");
    expect(sent.map(({ body }) => body.anchor)).toEqual([
      {
        kind: "paragraph",
        segmentId: "seg-1",
        segmentRevision: 2,
        range: { startMs: 5_000, endMs: 10_000 },
      },
      {
        kind: "paragraph",
        segmentId: "seg-2",
        segmentRevision: 2,
        range: { startMs: 10_000, endMs: 15_000 },
      },
    ]);
    expect(sent.map(({ body }) => body.note)).toEqual([
      "Why it matters",
      undefined,
    ]);
  });

  it("stops at a failure and retries only the unsaved lines with the same IDs", async () => {
    const urls: string[] = [];
    let fail = true;
    const fetcher: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body));
      urls.push(String(input));
      if (body.anchor.segmentId === "seg-2" && fail) {
        return Response.json({ error: "source_unavailable" }, { status: 503 });
      }
      return Response.json(savedBody(String(input), body));
    };
    const draft = startClip(
      sessionId,
      [line(1, 5_000), line(2, 10_000)],
      uuid(),
    );
    const first = await saveClip(draft, "", fetcher);
    expect(first.kind).toBe("error");
    expect(savedCount(first.draft)).toBe(1);
    fail = false;
    const second = await saveClip(first.draft, "", fetcher);
    expect(second.kind).toBe("saved");
    expect(urls).toEqual([urls[0], urls[1], urls[1]]);
  });
});
