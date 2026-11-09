import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("home page", () => {
  it("links to hosting and joining a session", () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain("Simon Says</h1>");
    expect(html).toMatch(/<a[^>]*href="\/host\/new"[^>]*>Host a session/);
    expect(html).toMatch(/<a[^>]*href="\/join"[^>]*>Join with a code/);
  });
});
