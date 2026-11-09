import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScreenShareControl } from "./screen-share-control";
import { ScreenShare } from "./screen-share";

describe("screen share controls", () => {
  const idle = new ScreenShare("s1").getSnapshot();
  const render = (enabled: boolean, patch: Partial<typeof idle> = {}) =>
    renderToStaticMarkup(
      <ScreenShareControl
        health={{ ...idle, ...patch }}
        enabled={enabled}
        onStart={() => {}}
        onStop={() => {}}
      />,
    );

  it("disables sharing until audio is running and describes why", () => {
    const html = render(false);
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain("Start audio to share your screen");
    expect(html).toContain('aria-describedby="screen-share-status"');
  });

  it("announces the share state and offers Stop sharing", () => {
    const html = render(true, { screen: "live" });
    expect(html).toContain("Stop sharing");
    expect(html).toContain('role="status"');
    expect(html).toContain("Sharing screen");
    expect(html).not.toContain('disabled=""');
  });

  it("gates a pending chooser and re-enables sharing after browser stop", () => {
    expect(render(true, { screen: "requesting" })).toMatch(
      /<button[^>]*disabled=""/,
    );
    const html = render(true, { screen: "stopped" });
    expect(html).toContain("Screen sharing stopped");
    expect(html).toContain("Share screen");
    expect(html).not.toContain('disabled=""');
  });

  it.each([403, 409, 503])("announces HTTP %s as a health alert", (status) => {
    const html = render(true, {
      screen: "live",
      lastErrorStatus: status,
      uploadFailed: true,
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain(String(status));
  });
});
