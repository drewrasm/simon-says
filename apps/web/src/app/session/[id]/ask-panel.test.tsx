import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AskAnswer } from "./ask-panel";

it("makes source timestamps clickable and leaves invented model citations inert", () => {
  const html = renderToStaticMarkup(
    <AskAnswer
      answer="An idea [03:12] and an unsupported time [09:99]. <script>alert(1)</script>"
      citations={[
        {
          segmentId: "s1",
          startMs: 192000.7,
          endMs: 195000,
          timestamp: "03:12",
          excerpt: "Synthetic caption",
        },
      ]}
      onCitation={() => undefined}
    />,
  );
  expect(html).toContain('href="#t=192000"');
  expect(html).toContain("00:03:12</a>");
  expect(html).toContain("[09:99]");
  expect(html).not.toContain('href="#t=599000"');
  expect(html).not.toContain("<script>");
  expect(html).toContain('aria-label="Jump to 00:03:12 in the transcript"');
  expect((html.match(/<a /g) ?? []).length).toBe(1);
});
