import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HostSetupPage from "./page";

describe("host setup page", () => {
  const html = renderToStaticMarkup(<HostSetupPage />);

  it("offers an optional, bounded session title", () => {
    expect(html).toContain("Session title (optional)");
    expect(html).toMatch(/<input[^>]*maxLength="120"/);
  });

  it("opens the lobby without requiring a microphone test first", () => {
    expect(html).toContain("New session");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Open lobby/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Open lobby/);
  });

  it("previews what guests will see without unsupported settings", () => {
    expect(html).toContain("What guests will see");
    expect(html).not.toMatch(/schedule|draft|profanity|language/i);
  });
});
