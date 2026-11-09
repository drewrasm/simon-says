import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import JoinByLinkPage from "./[inviteCode]/page";
import JoinPage from "./page";

describe("join by code page", () => {
  const html = renderToStaticMarkup(<JoinPage />);

  it("shows the attendee disclosure before joining", () => {
    expect(html).toContain("Before you join");
    expect(html).toContain("never uses its microphone");
  });

  it("keeps typed codes visibly unavailable until the contract supports them", () => {
    expect(html).toContain("Typed codes are coming soon");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});

describe("join by link page", () => {
  it("rejects a malformed invitation without offering to join", async () => {
    const page = await JoinByLinkPage({
      params: Promise.resolve({ inviteCode: "short" }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("incomplete or invalid");
    expect(html).not.toContain("Join session</button>");
  });
});
