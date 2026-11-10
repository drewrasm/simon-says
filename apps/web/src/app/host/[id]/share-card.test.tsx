import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShareCard } from "./share-card";

const render = (joinCode: string | null) =>
  renderToStaticMarkup(
    <ShareCard
      joinUrl="https://example.test/join/abcdefghijklmnop"
      joinCode={joinCode}
      title="Share with the room"
      description="Put this on screen so guests can join."
      headingId="share-heading"
    />,
  );

describe("share card", () => {
  it("shows the typed join code and where to enter it", () => {
    const html = render("7KM2QX");
    expect(html).toContain('aria-label="7KM2QX"');
    expect(html).toContain('href="https://example.test/join"');
    expect(html).not.toContain("Join link");
    expect(html).not.toContain("Guests scan");
  });

  it("shows only the QR code and link for a session without a join code", () => {
    const html = render(null);
    expect(html).not.toContain("Join code");
    expect(html).toContain("example.test/join/abcdefghijklmnop");
  });
});
