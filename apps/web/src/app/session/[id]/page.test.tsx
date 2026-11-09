import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CaptionReader } from "./caption-reader";
import { NotJoined } from "./not-joined";

describe("attendee caption reader", () => {
  it("shows an honest waiting state in a polite live region", () => {
    const html = renderToStaticMarkup(
      <CaptionReader title="Keynote" status="setup" />,
    );
    expect(html).toContain("Keynote</h1>");
    expect(html).toContain("Not live yet");
    expect(html).toMatch(/role="log"[^>]*aria-live="polite"/);
    expect(html).toContain("Waiting for the host");
  });

  it("says when the session has ended", () => {
    const html = renderToStaticMarkup(
      <CaptionReader title={null} status="ended" />,
    );
    expect(html).toContain("Live session</h1>");
    expect(html).toContain("This session has ended");
  });

  it("tells non-members how to join", () => {
    const html = renderToStaticMarkup(<NotJoined />);
    expect(html).toContain("haven&#x27;t joined this session");
    expect(html).toMatch(/href="\/join"/);
  });
});
