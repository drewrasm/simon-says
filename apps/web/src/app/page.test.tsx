import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("home page", () => {
  const html = renderToStaticMarkup(<HomePage />);

  it("links to hosting and joining a session", () => {
    expect(html).toContain("<h1");
    expect(html).toMatch(/<a[^>]*href="\/host\/new"[^>]*>Host a session/);
    expect(html).toMatch(/<a[^>]*href="\/join"[^>]*>Join with a code/);
  });

  it("offers no host accounts", () => {
    expect(html).not.toMatch(/sign in|account with|email/i);
  });
});
