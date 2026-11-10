import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import JoinByLinkPage from "./[inviteCode]/page";
import JoinPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const renderJoinPage = async (code?: string) =>
  renderToStaticMarkup(
    await JoinPage({ searchParams: Promise.resolve({ code }) }),
  );

describe("join by code page", () => {
  let html = "";
  beforeAll(async () => {
    html = await renderJoinPage();
  });

  it("shows the attendee disclosure before joining", () => {
    expect(html).toContain("Before you join");
    expect(html).toContain("never uses its microphone");
  });

  it("follows the guest join design without requiring an account", () => {
    expect(html).toContain("Read along, live");
    expect(html).toContain("QR code on the stage screen");
    expect(html).toContain("No account or app download needed.");
  });

  it("accepts a typed code and holds Join until the code is complete", () => {
    expect(html).not.toContain("coming soon");
    expect(html).toMatch(/<input(?![^>]*disabled="")[^>]*id="join-code"/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});

describe("join page prefill", () => {
  it("prefills a code passed from the home page, normalized", async () => {
    expect(await renderJoinPage(" kq742m ")).toMatch(
      /<input[^>]*id="join-code"[^>]*value="KQ742M"/,
    );
  });

  it("ignores a malformed code instead of prefilling it", async () => {
    expect(await renderJoinPage("KQ7I2M")).toMatch(
      /<input[^>]*id="join-code"[^>]*value=""/,
    );
  });
});

describe("join by link page", () => {
  it("rejects a malformed invitation without offering to join", async () => {
    const page = await JoinByLinkPage({
      params: Promise.resolve({ inviteCode: "short" }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("incomplete or invalid");
    expect(html).not.toContain("Join session</button>");
  });
});
