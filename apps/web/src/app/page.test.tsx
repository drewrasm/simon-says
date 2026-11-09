import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("foundation page", () => {
  it("renders the app with session creation visibly unavailable", () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain("Simon Says</h1>");
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain("Sessions coming soon");
    expect(html).toContain("still in development");
  });
});
