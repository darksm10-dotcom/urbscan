# Email Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Email" tab to building-finder that scrapes a company website and generates a personalized sales email using DeepSeek API.

**Architecture:** `lib/scraper.ts` fetches 3 pages and strips HTML to plain text (same pattern as existing `scrape-emails` route). `lib/email-writer.ts` calls DeepSeek API (OpenAI-compatible) with a single prompt. `app/api/generate-email/route.ts` orchestrates both. `components/EmailGenerator.tsx` provides the UI. `app/page.tsx` gets a new "email" tab entry.

**Tech Stack:** Next.js 16 App Router, TypeScript, DeepSeek API (via `openai` npm package with custom baseURL), native `fetch` for scraping, vitest for unit tests.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/scraper.ts` | Create | Fetch + strip HTML from 3 pages |
| `lib/email-writer.ts` | Create | DeepSeek API call, returns subject + body |
| `app/api/generate-email/route.ts` | Create | Orchestrates scrape → write, returns JSON |
| `components/EmailGenerator.tsx` | Create | Full UI: form + loading + result + copy |
| `app/page.tsx` | Modify | Add "email" to AppTab + nav + render |
| `.env.local` | Modify | Add DEEPSEEK_API_KEY |
| `package.json` | Modify | Add openai, vitest, @vitest/ui |
| `vitest.config.ts` | Create | Vitest config for lib/ unit tests |

---

## Task 1: Install dependencies + vitest setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install packages**

```bash
cd /Users/sm/building-finder
npm install openai
npm install -D vitest @vitest/ui
```

Expected: `package-lock.json` updated, no errors.

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest works**

```bash
cd /Users/sm/building-finder
npx vitest run
```

Expected: "No test files found" — that's fine, no error.

- [ ] **Step 5: Commit**

```bash
cd /Users/sm/building-finder
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add openai + vitest"
```

---

## Task 2: `lib/scraper.ts` — website text extractor

**Files:**
- Create: `lib/scraper.ts`
- Create: `lib/scraper.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/scraper.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd /Users/sm/building-finder
npx vitest run lib/scraper.test.ts
```

Expected: FAIL — "Cannot find module './scraper'"

- [ ] **Step 3: Implement `lib/scraper.ts`**

Create `lib/scraper.ts`:

```typescript
const SCRAPE_PATHS = ["/", "/about", "/about-us", "/products", "/services"];
const FETCH_TIMEOUT_MS = 8000;
const MAX_CHARS = 6000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractMeta(html: string): string {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "";
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  return [title, desc].filter(Boolean).join(" | ");
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const html = await res.text();
    const meta = extractMeta(html);
    const body = stripHtml(html);
    return [meta, body].filter(Boolean).join("\n");
  } catch {
    clearTimeout(timer);
    return "";
  }
}

export async function scrapeCompany(baseUrl: string): Promise<string> {
  const origin = new URL(baseUrl).origin;
  const tried = new Set<string>();
  const parts: string[] = [];

  for (const path of SCRAPE_PATHS) {
    const url = origin + path;
    if (tried.has(url)) continue;
    tried.add(url);
    const text = await fetchPage(url);
    if (text) parts.push(text);
    if (parts.length >= 3) break;
  }

  return parts.join("\n\n").slice(0, MAX_CHARS);
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd /Users/sm/building-finder
npx vitest run lib/scraper.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/sm/building-finder
git add lib/scraper.ts lib/scraper.test.ts
git commit -m "feat: add website scraper"
```

---

## Task 3: `lib/email-writer.ts` — DeepSeek email generator

**Files:**
- Create: `lib/email-writer.ts`
- Create: `lib/email-writer.test.ts`

- [ ] **Step 1: Add DEEPSEEK_API_KEY to .env.local**

Open `.env.local` (create if missing) and add:
```
DEEPSEEK_API_KEY=sk-your-key-here
NEXT_PUBLIC_DEFAULT_PRODUCT=Fiber & DIA enterprise connectivity solutions for businesses in Malaysia
```

Replace `sk-your-key-here` with your actual DeepSeek API key from https://platform.deepseek.com/

- [ ] **Step 2: Write failing test**

Create `lib/email-writer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  subject: "Connecting Acme with better connectivity",
                  body: "Hi team,\n\nI noticed Acme Corp provides enterprise widgets...",
                  key_insights: ["Enterprise focus", "B2B company", "Based in KL"],
                }),
              },
            }],
          }),
        },
      },
    })),
  };
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
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd /Users/sm/building-finder
npx vitest run lib/email-writer.test.ts
```

Expected: FAIL — "Cannot find module './email-writer'"

- [ ] **Step 4: Implement `lib/email-writer.ts`**

Create `lib/email-writer.ts`:

```typescript
import OpenAI from "openai";

export type EmailType = "cold" | "followup" | "proposal";
export type Language = "en" | "zh";

export interface EmailResult {
  subject: string;
  body: string;
  key_insights: string[];
}

export interface GenerateEmailParams {
  companyContent: string;
  emailType: EmailType;
  language: Language;
  productDescription: string;
}

const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  cold: "cold outreach (first contact, introduce yourself and your product)",
  followup: "follow-up (you've had previous contact, reference that and add value)",
  proposal: "proposal (you've analyzed their needs, present your solution directly)",
};

const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
};

export async function generateEmail(params: GenerateEmailParams): Promise<EmailResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });

  const { companyContent, emailType, language, productDescription } = params;

  const prompt = `You are a B2B sales email writer. Write a concise, personalized sales email.

COMPANY WEBSITE CONTENT:
${companyContent}

TASK:
- Email type: ${EMAIL_TYPE_LABELS[emailType]}
- Language: ${LANGUAGE_LABELS[language]}
- Your product/service: ${productDescription}

RULES:
- Subject line: specific and compelling, under 60 chars
- Body: 3-4 short paragraphs, no generic filler
- Reference specific details from the company content
- Do NOT use placeholder text like [Name] or [Company]
- Use the company name if found in the content

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "subject": "...",
  "body": "...",
  "key_insights": ["insight 1", "insight 2", "insight 3"]
}`;

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 1000,
  });

  const raw = response.choices[0]?.message?.content ?? "";

  try {
    return JSON.parse(raw) as EmailResult;
  } catch {
    throw new Error(`DeepSeek returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
cd /Users/sm/building-finder
npx vitest run lib/email-writer.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
cd /Users/sm/building-finder
git add lib/email-writer.ts lib/email-writer.test.ts .env.local
git commit -m "feat: add DeepSeek email writer"
```

---

## Task 4: `app/api/generate-email/route.ts` — API route

**Files:**
- Create: `app/api/generate-email/route.ts`

- [ ] **Step 1: Create the API route**

Create `app/api/generate-email/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { scrapeCompany } from "@/lib/scraper";
import { generateEmail, EmailType, Language } from "@/lib/email-writer";

export async function POST(req: NextRequest) {
  let url: string, emailType: EmailType, language: Language, productDescription: string;

  try {
    const body = await req.json();
    url = body.url;
    emailType = body.emailType ?? "cold";
    language = body.language ?? "en";
    productDescription = body.productDescription ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const companyContent = await scrapeCompany(parsedUrl.href);

  if (!companyContent) {
    return NextResponse.json(
      { error: "Could not access this website. Check the URL and try again." },
      { status: 422 }
    );
  }

  try {
    const result = await generateEmail({ companyContent, emailType, language, productDescription });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Start dev server and test the route manually**

```bash
cd /Users/sm/building-finder
npm run dev
```

In a new terminal:
```bash
curl -X POST http://localhost:3000/api/generate-email \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","emailType":"cold","language":"en","productDescription":"Fiber internet"}'
```

Expected: JSON with `subject`, `body`, `key_insights` fields. (If example.com fails, try any real company URL.)

- [ ] **Step 3: Commit**

```bash
cd /Users/sm/building-finder
git add app/api/generate-email/route.ts
git commit -m "feat: add generate-email API route"
```

---

## Task 5: `components/EmailGenerator.tsx` — UI component

**Files:**
- Create: `components/EmailGenerator.tsx`

- [ ] **Step 1: Create the component**

Create `components/EmailGenerator.tsx`:

```typescript
"use client";

import { useState } from "react";
import { EmailType, Language, EmailResult } from "@/lib/email-writer";

const DEFAULT_PRODUCT =
  process.env.NEXT_PUBLIC_DEFAULT_PRODUCT ??
  "Enterprise connectivity solutions";

type LoadingStage = "scraping" | "writing" | null;

export default function EmailGenerator() {
  const [url, setUrl] = useState("");
  const [emailType, setEmailType] = useState<EmailType>("cold");
  const [language, setLanguage] = useState<Language>("en");
  const [productDescription, setProductDescription] = useState(DEFAULT_PRODUCT);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [result, setResult] = useState<EmailResult | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [editedSubject, setEditedSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (!url.trim()) return;
    setError(null);
    setResult(null);
    setLoadingStage("scraping");

    // Show "Writing..." after 3s to indicate progress
    const timer = setTimeout(() => setLoadingStage("writing"), 3000);

    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), emailType, language, productDescription }),
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setResult(data as EmailResult);
      setEditedSubject(data.subject);
      setEditedBody(data.body);
    } catch {
      clearTimeout(timer);
      setError("Network error. Please try again.");
    } finally {
      setLoadingStage(null);
    }
  }

  function handleCopy() {
    const text = `Subject: ${editedSubject}\n\n${editedBody}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isLoading = loadingStage !== null;

  return (
    <div style={{ maxWidth: "720px", padding: "32px 40px" }}>
      <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
        Email Generator
      </div>
      <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "28px" }}>
        Paste a company URL to generate a personalized sales email
      </div>

      {/* URL input */}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
          Company Website
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder="https://company.com"
          disabled={isLoading}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            fontSize: "14px",
            fontFamily: "var(--font-ui)",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Email type + language row */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
            Email Type
          </label>
          <select
            value={emailType}
            onChange={(e) => setEmailType(e.target.value as EmailType)}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-ui)",
            }}
          >
            <option value="cold">Cold Outreach</option>
            <option value="followup">Follow-up</option>
            <option value="proposal">Proposal</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
            Language
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-ui)",
            }}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </div>

      {/* Product description */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
          Your Product / Service
        </label>
        <textarea
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          disabled={isLoading}
          rows={2}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            fontSize: "14px",
            fontFamily: "var(--font-ui)",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isLoading || !url.trim()}
        style={{
          padding: "10px 28px",
          borderRadius: "8px",
          border: "none",
          background: isLoading || !url.trim() ? "var(--border)" : "var(--text-primary)",
          color: isLoading || !url.trim() ? "var(--text-secondary)" : "var(--bg-card)",
          fontSize: "14px",
          fontWeight: 600,
          cursor: isLoading || !url.trim() ? "not-allowed" : "pointer",
          fontFamily: "var(--font-ui)",
          marginBottom: "24px",
        }}
      >
        {isLoading
          ? loadingStage === "scraping" ? "Scraping website..." : "Writing email..."
          : "Generate Email"}
      </button>

      {/* Error */}
      {error && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "8px",
          background: "rgba(255,80,80,0.1)",
          color: "var(--text-primary)",
          fontSize: "14px",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div>
          {/* Key insights */}
          <details style={{ marginBottom: "20px" }}>
            <summary style={{ fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer", marginBottom: "8px" }}>
              Key insights used ({result.key_insights.length})
            </summary>
            <ul style={{ paddingLeft: "20px", margin: "8px 0 0 0" }}>
              {result.key_insights.map((insight, i) => (
                <li key={i} style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  {insight}
                </li>
              ))}
            </ul>
          </details>

          {/* Subject */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Subject
            </label>
            <input
              type="text"
              value={editedSubject}
              onChange={(e) => setEditedSubject(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                fontSize: "14px",
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Body */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Body
            </label>
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={12}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                fontSize: "14px",
                fontFamily: "var(--font-ui)",
                lineHeight: 1.6,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: copied ? "var(--bg-elevated)" : "transparent",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
            }}
          >
            {copied ? "Copied!" : "Copy Email"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/sm/building-finder
git add components/EmailGenerator.tsx
git commit -m "feat: add EmailGenerator UI component"
```

---

## Task 6: Wire up the Email tab in `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add "email" to AppTab type**

In `app/page.tsx`, find:
```typescript
type AppTab = "today" | "scan" | "contacts" | "notes";
```

Replace with:
```typescript
type AppTab = "today" | "scan" | "contacts" | "notes" | "email";
```

- [ ] **Step 2: Add EmailGenerator dynamic import**

Below the existing dynamic imports, add:
```typescript
const EmailGenerator = dynamic(() => import("@/components/EmailGenerator"), { ssr: false });
```

- [ ] **Step 3: Add "Email" to the nav tabs array**

Find the tabs array:
```typescript
{ tab: "notes",    label: "Notes" },
```

Add after it:
```typescript
{ tab: "email",    label: "Email" },
```

- [ ] **Step 4: Add Email tab render**

Find the last else branch before closing `</main>`:
```typescript
        ) : (
          <section style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
            <NotesPanel />
          </section>
        )}
```

Replace with:
```typescript
        ) : activeTab === "notes" ? (
          <section style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
            <NotesPanel />
          </section>
        ) : (
          <section style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
            <EmailGenerator />
          </section>
        )}
```

- [ ] **Step 5: Verify dev server shows the Email tab**

```bash
cd /Users/sm/building-finder
npm run dev
```

Open http://localhost:3000, click "Email" tab. Verify the form appears.

Enter a URL (e.g. `https://tmone.com.my`), click Generate. Verify email appears.

- [ ] **Step 6: Run all tests**

```bash
cd /Users/sm/building-finder
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/sm/building-finder
git add app/page.tsx
git commit -m "feat: add Email tab to navigation"
```

---

## Done

The Email Generator is complete. Summary of what was built:

- `lib/scraper.ts` — fetches up to 3 pages, strips HTML, returns plain text (max 6000 chars)
- `lib/email-writer.ts` — calls DeepSeek API, returns structured email JSON
- `app/api/generate-email/route.ts` — orchestrates scrape + write, validates input
- `components/EmailGenerator.tsx` — full UI with form, loading states, editable result, copy button
- `app/page.tsx` — new "Email" tab wired up
