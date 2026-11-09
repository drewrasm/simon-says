import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HostSetupPage from "./page";

describe("host setup page", () => {
  const html = renderToStaticMarkup(<HostSetupPage />);

  it("marks Start session as a stub", () => {
    expect(html).toContain("Start session does nothing yet");
  });

  it("starts with the microphone untested and Start disabled", () => {
    expect(html).toContain("Set up your session");
    expect(html).toContain("Test microphone");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Start session/);
  });
});
