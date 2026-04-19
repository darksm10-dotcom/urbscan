import { describe, it, expect, vi, beforeEach } from "vitest";
import { scrapeCompany } from "./scraper";

describe("scrapeCompany", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts text from homepage and returns combined content", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `
        <html>
          <head><title>Acme Corp</title><meta name="description" content="We build widgets"></head>
          <nav>Nav stuff</nav>
          <body>
            <h1>Welcome to Acme</h1>
            <p>We provide enterprise solutions.</p>
            <footer>Footer stuff</footer>
            <script>alert('x')</script>
          </body>
        </html>
      `,
    } as Response);

    const result = await scrapeCompany("https://acme.com");

    expect(result).toContain("Acme Corp");
    expect(result).toContain("We build widgets");
    expect(result).toContain("Welcome to Acme");
    expect(result).toContain("We provide enterprise solutions");
    expect(result).not.toContain("Nav stuff");
    expect(result).not.toContain("Footer stuff");
    expect(result).not.toContain("alert");
  });

  it("skips pages that return non-ok status", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => "<html><body><h1>Home</h1></body></html>" } as Response)
      .mockResolvedValueOnce({ ok: false, text: async () => "" } as Response)
      .mockResolvedValueOnce({ ok: false, text: async () => "" } as Response);

    const result = await scrapeCompany("https://example.com");

    expect(result).toContain("Home");
  });

  it("returns empty string when all pages fail", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => "" } as Response);

    const result = await scrapeCompany("https://unreachable.com");

    expect(result).toBe("");
  });

  it("truncates output to 6000 chars", async () => {
    const longText = "x".repeat(10000);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `<html><body><p>${longText}</p></body></html>`,
    } as Response);

    const result = await scrapeCompany("https://example.com");

    expect(result.length).toBeLessThanOrEqual(6000);
  });
});
