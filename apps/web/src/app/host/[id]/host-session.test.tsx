import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HostSession } from "./host-session";

describe("host lobby", () => {
  const html = renderToStaticMarkup(
    <HostSession
      sessionId="s1"
      title="Opening keynote"
      status="setup"
      joinPath="/join/abc"
      joinCode="7KM2QX"
    />,
  );

  it("shows sharing, microphone pre-flight, and a gated Go live", () => {
    expect(html).toContain("Get ready to go live");
    expect(html).toContain("Share with the room");
    expect(html).toContain("Pre-flight check");
    expect(html).toContain("Test microphone");
    expect(html).toContain("Lobby open · not live");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Go live/);
  });

  it("does not show controls the backend lacks", () => {
    expect(html).not.toMatch(/pause|download|guests waiting|language/i);
  });

  it("hides Go live once the session has ended", () => {
    const ended = renderToStaticMarkup(
      <HostSession
        sessionId="s1"
        title={null}
        status="ended"
        joinPath="/join/abc"
        joinCode={null}
      />,
    );
    expect(ended).toContain("This session has ended");
    expect(ended).not.toContain("Go live");
  });
});
