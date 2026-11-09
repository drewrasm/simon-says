import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HostSetupPage from "./page";

describe("host setup page", () => {
  const html = renderToStaticMarkup(<HostSetupPage />);

  it("no longer marks Start session as a stub", () => {
    expect(html).not.toContain("does nothing yet");
  });

  it("offers an optional, bounded session title", () => {
    expect(html).toContain("Session title (optional)");
    expect(html).toMatch(/<input[^>]*maxLength="120"/);
  });

  it("starts with the microphone untested and Start disabled", () => {
    expect(html).toContain("Set up your session");
    expect(html).toContain("Test microphone");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Start session/);
  });
});
