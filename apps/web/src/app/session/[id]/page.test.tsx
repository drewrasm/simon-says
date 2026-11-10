import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CaptionReader } from "./caption-reader";
import { NotJoined } from "./not-joined";

const linkTo = (html: string, href: string) =>
  html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0] ?? "";

describe("attendee caption reader", () => {
  it("shows an honest waiting state in a polite live region", () => {
    const html = renderToStaticMarkup(
      <CaptionReader
        sessionId="s1"
        title="Keynote"
        status="setup"
        noteCount={0}
      />,
    );
    expect(html).toContain("Keynote</h1>");
    expect(html).toContain("Not live yet");
    expect(html).toMatch(/role="log"[^>]*aria-live="polite"/);
    expect(html).toContain("Waiting for the host");
  });

  it("reads in the dark theme with text size controls and a live indicator", () => {
    const html = renderToStaticMarkup(
      <CaptionReader
        sessionId="s1"
        title="Keynote"
        status="live"
        noteCount={0}
      />,
    );
    expect(html).toMatch(/^<div class="dark /);
    expect(html).toContain('aria-label="Smaller text"');
    expect(html).toContain('aria-label="Larger text"');
    expect(html).toContain("Following live");
    // Return to live appears only after the reader scrolls away.
    expect(html).not.toContain("Return to live");
    // Interim text is never inside the announced log.
    expect(html).not.toContain("Now</span>");
  });

  it("says when the session has ended", () => {
    const html = renderToStaticMarkup(
      <CaptionReader
        sessionId="s1"
        title={null}
        status="ended"
        noteCount={0}
      />,
    );
    expect(html).toContain("Live session</h1>");
    expect(html).toContain("This session has ended");
  });

  it("links to the notes page with a count when there is no side panel", () => {
    const html = renderToStaticMarkup(
      <CaptionReader
        sessionId="s1"
        title="Keynote"
        status="setup"
        noteCount={2}
      />,
    );
    const link = linkTo(html, "/session/s1/notes");
    expect(link).toContain('aria-label="My notes, 2 saved"');
    expect(link).not.toContain("lg:hidden");
    expect(html).not.toContain("Hide notes");
  });

  it("opens notes beside the captions on wide screens, with a toggle", () => {
    const html = renderToStaticMarkup(
      <CaptionReader
        sessionId="s1"
        title="Keynote"
        status="setup"
        noteCount={2}
        notesPanel={<p>panel body</p>}
        actions={<button type="button">Note</button>}
      />,
    );
    // Phones keep the separate notes page and the bottom note sheet.
    expect(linkTo(html, "/session/s1/notes")).toContain("lg:hidden");
    expect(html).toMatch(/<div class="[^"]*lg:hidden[^"]*"><button[^>]*>Note/);
    // Wide screens get the panel, open by default, and a labelled toggle.
    expect(html).toMatch(
      /<button[^>]*aria-expanded="true"[^>]*aria-controls="notes-panel"[^>]*>.*My notes/,
    );
    expect(html).toMatch(
      /<aside id="notes-panel" aria-label="Notes and Ask"[^>]*>/,
    );
    expect(html).not.toMatch(/<aside[^>]*hidden=""/);
    expect(html).toContain("panel body");
  });

  it("tells non-members how to join", () => {
    const html = renderToStaticMarkup(<NotJoined />);
    expect(html).toContain("haven&#x27;t joined this session");
    expect(html).toMatch(/href="\/join"/);
  });
});
