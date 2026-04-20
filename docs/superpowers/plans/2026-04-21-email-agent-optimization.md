# Email Agent Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve email agent with website content enrichment for AI, batch generation for multiple queued items, and wider left panel with per-item progress states.

**Architecture:** Add `/api/enrich-website` to scrape website summaries; extend `/api/generate-email` to accept the summary; rewrite `EmailPanel.tsx` left panel to 340px with checkboxes and a batch action bar that runs enrich+generate concurrently (max 3) per selected queued item.

**Tech Stack:** Next.js App Router, React, TypeScript, nodemailer (existing), `cheerio` or native DOM parsing for HTML scraping.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `types/index.ts` | Add `websiteSummary?` to `EmailDraft` |
| Create | `app/api/enrich-website/route.ts` | Fetch website HTML, extract summary ≤500 chars |
| Modify | `app/api/generate-email/route.ts` | Accept `websiteSummary` param, inject into prompt |
| Modify | `components/EmailPanel.tsx` | Wider list (340px), checkboxes, batch action bar, per-item progress states |

---

### Task 1: Add `websiteSummary` to `EmailDraft` type

**Files:**
- Modify: `types/index.ts:28-43`

- [ ] **Step 1: Add field to type**

In `types/index.ts`, add `websiteSummary?: string;` to `EmailDraft`:

```typescript
export interface EmailDraft {
  id: string;
  contactId: string;
  buildingName: string;
  buildingAddress?: string;
  website?: string;
  websiteSummary?: string;   // cached after enrich
  recipientEmail: string;
  recipientName: string;
  ccEmails?: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  status: "queued" | "draft" | "sent";
  createdAt: string;
  sentAt?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/sm/building-finder && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to this change).

- [ ] **Step 3: Commit**

```bash
cd /Users/sm/building-finder && git add types/index.ts && git commit -m "feat: add websiteSummary field to EmailDraft type"
```

---

### Task 2: Create `/api/enrich-website` endpoint

**Files:**
- Create: `app/api/enrich-website/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  url: z.string().url(),
});

function extractSummary(html: string): string {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? "";

  // Extract meta description
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i);
  const meta = metaMatch?.[1]?.trim() ?? "";

  // Extract first non-empty paragraph text
  const pMatches = [...html.matchAll(/<p[^>]*>([^<]{20,300})<\/p>/gi)];
  const firstP = pMatches[0]?.[1]?.replace(/\s+/g, " ").trim() ?? "";

  const parts = [title, meta, firstP].filter(Boolean);
  return parts.join(" | ").slice(0, 500);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ summary: "" });
  }

  const { url } = parsed.data;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildingFinder/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return NextResponse.json({ summary: "" });

    const html = await res.text();
    const summary = extractSummary(html);
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: "" });
  }
}
```

- [ ] **Step 2: Test the endpoint manually**

Start dev server in one terminal, then:

```bash
curl -s -X POST http://localhost:3000/api/enrich-website \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' | cat
```

Expected: `{"summary":"Example Domain | ..."}` or similar non-empty JSON.

- [ ] **Step 3: Test failure cases**

```bash
# Invalid URL
curl -s -X POST http://localhost:3000/api/enrich-website \
  -H "Content-Type: application/json" \
  -d '{"url":"not-a-url"}' | cat
```

Expected: `{"summary":""}` — never an error response.

- [ ] **Step 4: Commit**

```bash
cd /Users/sm/building-finder && git add app/api/enrich-website/route.ts && git commit -m "feat: add enrich-website endpoint for AI context"
```

---

### Task 3: Extend `/api/generate-email` to accept `websiteSummary`

**Files:**
- Modify: `app/api/generate-email/route.ts`

- [ ] **Step 1: Add `websiteSummary` to the Zod schema and prompt**

Replace the `Body` schema and prompt construction:

```typescript
const Body = z.object({
  buildingName: z.string(),
  buildingAddress: z.string().optional(),
  recipientName: z.string().optional(),
  note: z.string().optional(),
  product: z.string().optional(),
  rolePrompt: z.string().optional(),
  websiteSummary: z.string().optional(),
});
```

In the `POST` handler, destructure `websiteSummary` and add to prompt:

```typescript
const { buildingName, buildingAddress, recipientName, note, product, rolePrompt, websiteSummary } = parsed.data;
const productDesc = product ?? process.env.NEXT_PUBLIC_DEFAULT_PRODUCT ?? "enterprise connectivity solutions";

const systemContext = rolePrompt
  ? rolePrompt
  : `You are a B2B sales rep at Innet, a Malaysian ISP selling ${productDesc}.`;

const websiteContext = websiteSummary
  ? `\nWebsite context about the company: ${websiteSummary}`
  : "";

const prompt = `${systemContext}

Write a cold outreach email to ${recipientName ? `${recipientName} at ` : ""}${buildingName}${buildingAddress ? ` located at ${buildingAddress}` : ""}.${websiteContext}
${note ? `Additional context: ${note}` : ""}

Requirements:
- Subject: concise and relevant
- Body: 3-4 short paragraphs max
- Clear CTA at the end

Respond ONLY in JSON: { "subject": "...", "bodyText": "...", "bodyHtml": "..." }
bodyHtml = bodyText wrapped in <p> tags per paragraph.`;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/sm/building-finder && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/sm/building-finder && git add app/api/generate-email/route.ts && git commit -m "feat: pass websiteSummary context to AI email generator"
```

---

### Task 4: Rewrite `EmailPanel.tsx` — left panel + batch action bar

**Files:**
- Modify: `components/EmailPanel.tsx`

This is the largest task. We make targeted changes to the existing file:
1. Widen left panel from 260px → 340px
2. Add `selected` set (for checkboxes) and `generatingIds` set to component state
3. Add batch action bar UI above the list
4. Update `PipelineItem` to show checkboxes and per-item progress state
5. Add `handleBatchGenerate` function

- [ ] **Step 1: Add batch state to the main `EmailPanel` component**

In `EmailPanel`, add these state variables after the existing `useState` declarations (around line 34):

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
const [batchRunning, setBatchRunning] = useState(false);
const abortRef = useRef<boolean>(false);
```

- [ ] **Step 2: Add `handleBatchGenerate` function**

Add this function inside `EmailPanel` after `handleGenerate`:

```typescript
async function handleBatchGenerate() {
  const targets = items.filter((d) => d.status === "queued" && selectedIds.has(d.id));
  if (targets.length === 0) return;

  setBatchRunning(true);
  abortRef.current = false;
  setBatchProgress({ done: 0, total: targets.length });

  const CONCURRENCY = 3;
  let index = 0;
  let done = 0;

  async function processOne(draft: EmailDraft) {
    if (abortRef.current) return;
    setGeneratingIds((prev) => new Set(prev).add(draft.id));
    try {
      // Step 1: enrich website
      let websiteSummary = draft.websiteSummary ?? "";
      if (!websiteSummary && draft.website) {
        const enrichRes = await fetch("/api/enrich-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: draft.website }),
        });
        if (enrichRes.ok) {
          const enrichData = await enrichRes.json() as { summary: string };
          websiteSummary = enrichData.summary;
          updateEmailDraft(draft.id, { websiteSummary });
        }
      }

      if (abortRef.current) return;

      // Step 2: generate email
      const genRes = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingName: draft.buildingName,
          buildingAddress: draft.buildingAddress,
          recipientName: draft.recipientName,
          note: draft.bodyText || undefined,
          rolePrompt: rolePrompt || undefined,
          websiteSummary: websiteSummary || undefined,
        }),
      });

      if (!genRes.ok) throw new Error(`Generation failed (${genRes.status})`);
      const data = await genRes.json() as { subject: string; bodyText: string; bodyHtml: string };
      updateEmailDraft(draft.id, {
        subject: data.subject,
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
        status: "draft",
      });
    } catch {
      // Leave as queued — UI will show no generating state = failed implicitly
      // User can retry individually
    } finally {
      setGeneratingIds((prev) => { const s = new Set(prev); s.delete(draft.id); return s; });
      done++;
      setBatchProgress({ done, total: targets.length });
    }
  }

  // Run with concurrency limit
  async function runWorker() {
    while (index < targets.length && !abortRef.current) {
      const item = targets[index++];
      await processOne(item);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, runWorker);
  await Promise.all(workers);

  setBatchRunning(false);
  setBatchProgress(null);
  setSelectedIds(new Set());

  // Auto-select first newly created draft
  const freshDrafts = getEmailDrafts().filter((d) => d.status === "draft");
  if (freshDrafts.length > 0 && !selectedId) {
    selectItem(freshDrafts[0]);
  }
}
```

- [ ] **Step 3: Update left panel width and add batch action bar**

In the JSX, change `width: "260px"` → `width: "340px"` in the left panel container.

Replace the left panel header section (the `<div>` with "Email Pipeline" title) with:

```tsx
<div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px" }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
    <div>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>Email Pipeline</div>
      <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{pending.length} 待处理 · {sent.length} 已发送</div>
    </div>
    <button
      onClick={() => { setShowPrompt(true); setSelectedId(null); }}
      title="编辑 AI Prompt"
      style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "4px", padding: "4px 8px", color: "var(--text-dim)", cursor: "pointer", fontSize: "13px" }}
    >⚙</button>
  </div>

  {/* Batch action bar */}
  {pending.length > 0 && (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
      <input
        type="checkbox"
        checked={selectedIds.size === pending.length && pending.length > 0}
        onChange={(e) => {
          if (e.target.checked) setSelectedIds(new Set(pending.map((d) => d.id)));
          else setSelectedIds(new Set());
        }}
        style={{ cursor: "pointer" }}
      />
      <span style={{ color: "var(--text-dim)", flex: 1 }}>
        {selectedIds.size > 0 ? `已选 ${selectedIds.size}` : "全选"}
      </span>
      {batchProgress && (
        <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>
          {batchProgress.done}/{batchProgress.total}
        </span>
      )}
      <button
        onClick={batchRunning ? () => { abortRef.current = true; } : handleBatchGenerate}
        disabled={!batchRunning && selectedIds.size === 0}
        style={{
          padding: "4px 10px",
          borderRadius: "4px",
          border: "1px solid var(--border)",
          background: batchRunning ? "rgba(239,68,68,0.1)" : "transparent",
          color: batchRunning ? "#f87171" : "var(--amber)",
          cursor: (!batchRunning && selectedIds.size === 0) ? "not-allowed" : "pointer",
          fontSize: "11px",
          fontWeight: 600,
          opacity: (!batchRunning && selectedIds.size === 0) ? 0.4 : 1,
        }}
      >
        {batchRunning ? "停止" : "✦ 批量生成"}
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 4: Update `PipelineItem` to show checkbox and generating state**

Replace the `PipelineItem` function signature and body:

```typescript
function PipelineItem({
  d, selected, leadStatus, isChecked, isGenerating, onClick, onCheck,
}: {
  d: EmailDraft;
  selected: boolean;
  leadStatus?: string;
  isChecked: boolean;
  isGenerating: boolean;
  onClick: () => void;
  onCheck: (checked: boolean) => void;
}) {
  const s = isGenerating
    ? { label: "✦ 生成中", color: "#a78bfa", bg: "rgba(167,139,250,0.12)" }
    : STATUS[d.status];
  const lm = leadStatus ? STATUS_META[leadStatus as keyof typeof STATUS_META] : null;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 16px",
        cursor: "pointer",
        borderLeft: selected ? `2px solid var(--amber)` : "2px solid transparent",
        background: selected ? "var(--bg-elevated)" : "transparent",
        transition: "background 0.1s",
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
      }}
    >
      {d.status === "queued" && (
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => { e.stopPropagation(); onCheck(e.target.checked); }}
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: "2px", flexShrink: 0, cursor: "pointer" }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "6px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.buildingName}
          </div>
          <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "3px", background: s.bg, color: s.color, flexShrink: 0, fontWeight: 600 }}>{s.label}</span>
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "3px", display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {d.recipientEmail || "未填邮箱"}
            {d.status === "sent" && d.sentAt && ` · ${new Date(d.sentAt).toLocaleDateString()}`}
          </span>
          {lm && <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: lm.bg, color: lm.color, flexShrink: 0, fontWeight: 600 }}>{lm.label}</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update `PipelineItem` call sites in the JSX**

Find the two `pending.map(...)` and `sent.map(...)` calls and update them:

```tsx
{pending.map((d) => (
  <PipelineItem
    key={d.id}
    d={d}
    selected={selectedId === d.id}
    leadStatus={pipeline[d.contactId]?.status}
    isChecked={selectedIds.has(d.id)}
    isGenerating={generatingIds.has(d.id)}
    onClick={() => selectItem(d)}
    onCheck={(checked) => {
      setSelectedIds((prev) => {
        const s = new Set(prev);
        if (checked) s.add(d.id);
        else s.delete(d.id);
        return s;
      });
    }}
  />
))}

{sent.map((d) => (
  <PipelineItem
    key={d.id}
    d={d}
    selected={selectedId === d.id}
    leadStatus={pipeline[d.contactId]?.status}
    isChecked={false}
    isGenerating={false}
    onClick={() => selectItem(d)}
    onCheck={() => {}}
  />
))}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/sm/building-finder && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 7: Test in browser**

```bash
cd /Users/sm/building-finder && npm run dev
```

Open http://localhost:3000, go to Email tab. Verify:
1. Left panel is wider (340px)
2. Queued items show checkboxes
3. "全选" checkbox selects all queued
4. "✦ 批量生成" button appears when items selected
5. Click batch generate — items show "✦ 生成中" badge
6. After completion, items become drafts
7. Sent items show no checkboxes

- [ ] **Step 8: Commit**

```bash
cd /Users/sm/building-finder && git add components/EmailPanel.tsx && git commit -m "feat: batch generate UI with website enrichment and wider panel"
```

---

## Self-Review

**Spec coverage check:**
- [x] AI quality — website content via `/api/enrich-website` + passed to generate-email
- [x] Batch operations — `handleBatchGenerate` with max-3 concurrency + stop button
- [x] Left panel wider — 340px
- [x] Per-item progress states — "✦ 生成中" badge via `generatingIds` set
- [x] Step count reduction — batch replaces individual queued → generate clicks
- [x] Error handling — individual failures leave item as queued, batch continues
- [x] Abort/stop — `abortRef` + "停止" button

**Placeholder scan:** None found — all steps have concrete code.

**Type consistency:**
- `EmailDraft.websiteSummary?: string` added in Task 1, used in Task 4's `handleBatchGenerate` (`draft.websiteSummary`, `updateEmailDraft(draft.id, { websiteSummary })`)
- `PipelineItem` new props (`isChecked`, `isGenerating`, `onCheck`) defined in Task 4 step 4 and consumed in step 5 ✓
- `generatingIds: Set<string>` used as `generatingIds.has(d.id)` in call site ✓
