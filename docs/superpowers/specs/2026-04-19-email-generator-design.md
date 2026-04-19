# Email Generator — Design Spec
**Date:** 2026-04-19  
**Project:** building-finder  
**Status:** Approved

---

## Overview

A new `/email` tab in the building-finder app that lets the user input a company website URL, automatically analyzes the company, and generates a personalized sales email. No authentication required. Works on both local and Vercel deployments.

---

## Architecture

```
app/email/page.tsx              ← UI: input form + email preview
app/api/generate-email/route.ts ← API: scrape → analyze → generate
lib/scraper.ts                  ← fetch + cheerio HTML extraction
lib/email-writer.ts             ← DeepSeek API prompt logic
```

### Data Flow

```
User inputs URL + email type + language
        ↓
POST /api/generate-email
        ↓
lib/scraper.ts
  - fetch homepage (/)
  - fetch /about (or /about-us)
  - fetch /products (or /services)
  - extract clean text via cheerio
        ↓
lib/email-writer.ts — single DeepSeek API call
  Input:  scraped text + email type + user's product description + language
  Output: { subject, body, company_name, key_insights }
        ↓
UI displays preview
  - Edit inline
  - Copy to clipboard
```

---

## UI — `/email` page

**Inputs:**
- URL field (required)
- Email type selector: Cold Outreach / Follow-up / Proposal
- Language toggle: English / Chinese
- Your product/service description (textarea, pre-filled with default, editable)

**Output panel:**
- Subject line
- Email body (editable)
- Key insights used (collapsible — shows what was extracted from the website)
- Copy button

**States:** idle → loading (with progress text: "Scraping...", "Analyzing...", "Writing email...") → result → error

---

## Scraping Strategy (`lib/scraper.ts`)

1. Attempt to fetch 3 pages: `/`, `/about`, `/products` (also try `/services`, `/about-us` as fallbacks)
2. Use `cheerio` to extract: `<title>`, `<meta description>`, `<h1>–<h3>`, `<p>` tags
3. Strip nav/footer/cookie banners (remove `<nav>`, `<footer>`, `<script>`, `<style>`)
4. Truncate to 6,000 chars total to stay within token budget
5. If a page 404s, skip it silently and proceed with available pages

---

## Email Generation (`lib/email-writer.ts`)

**Single DeepSeek API call** (deepseek-chat model):

**System prompt:** Sales email writer with context about user's product/service.

**User prompt includes:**
- Scraped company content
- Selected email type (cold / follow-up / proposal)
- Target language
- User's product description

**Output format (JSON):**
```json
{
  "company_name": "...",
  "subject": "...",
  "body": "...",
  "key_insights": ["insight 1", "insight 2", "insight 3"]
}
```

---

## Environment Variables

```
DEEPSEEK_API_KEY=sk-xxx
NEXT_PUBLIC_DEFAULT_PRODUCT_DESCRIPTION="..."  ← pre-fills the product textarea
```

---

## Navigation

Add "Email" tab to the existing navigation alongside the current map/search tab.

---

## Error Handling

- URL unreachable → show "Could not access this website. Try another URL."
- DeepSeek API error → show "Email generation failed. Please try again."
- Partial scrape (only 1 page fetched) → proceed and note in key_insights

---

## Out of Scope

- Gmail send integration (future)
- CRM Activity save (future)
- Batch URL processing (future)
- Authentication
