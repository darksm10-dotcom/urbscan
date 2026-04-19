import { describe, it, expect, vi } from "vitest";

const mockCreate = vi.fn().mockResolvedValue({
  choices: [{
    message: {
      content: JSON.stringify({
        subject: "Connecting Acme with better connectivity",
        body: "Hi team,\n\nI noticed Acme Corp provides enterprise widgets...",
        key_insights: ["Enterprise focus", "B2B company", "Based in KL"],
      }),
    },
  }],
});

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  }
  return { default: MockOpenAI };
});

import { generateEmail, EmailType } from "./email-writer";

describe("generateEmail", () => {
  it("returns subject, body, and key_insights", async () => {
    const result = await generateEmail({
      companyContent: "Acme Corp | Enterprise widgets for businesses",
      emailType: "cold" as EmailType,
      language: "en",
      productDescription: "Fiber internet solutions",
    });

    expect(result.subject).toBeTruthy();
    expect(result.body).toBeTruthy();
    expect(Array.isArray(result.key_insights)).toBe(true);
  });

  it("throws if API key is missing", async () => {
    const original = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    await expect(
      generateEmail({
        companyContent: "Some company",
        emailType: "cold",
        language: "en",
        productDescription: "Product",
      })
    ).rejects.toThrow("DEEPSEEK_API_KEY");

    process.env.DEEPSEEK_API_KEY = original;
  });
});
