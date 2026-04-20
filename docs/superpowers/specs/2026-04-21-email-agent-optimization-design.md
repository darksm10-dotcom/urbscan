# Email Agent Optimization Design

**Date:** 2026-04-21  
**Status:** Approved  
**Scope:** building-finder email agent

## Goals

1. **AI quality** — enrich prompts with website content for more personalized cold emails
2. **Batch operations** — select multiple queued items and generate all at once
3. **UI density** — wider left panel, per-item progress states, less manual clicking

## Architecture

Three-column layout:

```
[Left list 340px] | [Batch action bar - top of left] | [Right edit panel]
```

Files changed:
- `components/EmailPanel.tsx` — UI rewrite (list + batch bar)
- `app/api/generate-email/route.ts` — accept `websiteSummary` param
- `app/api/enrich-website/route.ts` — new endpoint

## Left Panel Redesign

Width: 340px (up from 260px).

Each list item shows:
```
☐  Building Name              [status badge]
   email@... · scrape state · AI state
```

Status badges:
| Value | Label | Notes |
|-------|-------|-------|
| queued | 待处理 | default |
| generating | ✦ 生成中 | transient UI state |
| failed | ⚠ 生成失败 | can retry individually |
| draft | 草稿 | ready to edit/send |
| sent | 已发送 | read-only |

## Batch Action Bar

Appears at top of left panel when ≥1 queued items exist:

```
☐ Select all   N queued   [✦ Batch Generate]   Progress: 2/3 ████░
```

- Checkbox selects/deselects all queued items
- Button label changes to `Stop` while running; clicking cancels pending jobs
- Progress bar updates in real time as each item completes
- On completion, auto-selects first newly-created draft

## Batch Generate Flow

```
Click "Batch Generate"
  → for each selected queued item (max 3 concurrent):
      1. POST /api/enrich-website  { url: draft.website }
         → returns { summary: string }  (empty string on failure/timeout)
      2. POST /api/generate-email  { ...existing fields, websiteSummary }
         → returns { subject, bodyText, bodyHtml }
      3. updateEmailDraft(id, { subject, bodyText, bodyHtml, status: "draft" })
  → each completes independently; failure shows ⚠ badge
```

Concurrency: `p-limit(3)` or manual semaphore — max 3 parallel API calls.

## `/api/enrich-website` Endpoint

**Input:** `{ url: string }`  
**Behavior:**
- Fetch HTML with 5s timeout
- Extract: `<title>`, `<meta name="description">`, first 2 `<p>` texts
- Truncate to 500 chars total
- On any error (timeout, parse failure, non-200): return `{ summary: "" }` silently

**Output:** `{ summary: string }`

## `/api/generate-email` Changes

Accept new optional field `websiteSummary?: string`.

Prompt addition (only when non-empty):
```
Website context about the company: ${websiteSummary}
```

No other changes to existing logic.

## Data Model Changes

`EmailDraft` type — add optional field:
```typescript
websiteSummary?: string  // cached after enrich; not re-fetched on regenerate
```

`generating` is UI-only state (React `useState`), not persisted to localStorage.

## Error Handling

- Individual item failure: set UI state to `failed`, show `⚠ 生成失败` + retry button
- All items fail: show error toast
- User stops batch: pending items remain `queued`, completed ones become `draft`
- `/api/enrich-website` failure: silently continue without website context

## Right Panel

No changes. Existing `QueuedPanel`, `DraftPanel`, `SentPanel` components kept as-is.

## Out of Scope

- Batch send (send all drafts at once)
- Keyboard navigation
- Kanban board layout
- Email open/click tracking
