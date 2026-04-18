# Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four focused improvements — Today tab UX, ResultsList refactor (extract WA templates lib + WhatsAppComposer component), and Contacts bulk mark-done.

**Architecture:** All changes are isolated. Tasks 2 and 3 are pure refactors (no behaviour change). Tasks 1 and 4 add new features in existing files.

**Tech Stack:** Next.js 16, React 19, TypeScript, localStorage, inline styles + CSS variables

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `app/page.tsx` | Default tab → "today", Today badge count |
| Modify | `components/TodayPanel.tsx` | Expose pending count, midnight refresh |
| Create | `lib/wa-templates.ts` | WaTemplate types + localStorage helpers extracted from ResultsList |
| Create | `components/WhatsAppComposer.tsx` | WhatsAppComposer component extracted from ResultsList |
| Modify | `components/ResultsList.tsx` | Remove extracted code, add imports |
| Modify | `components/ContactsPanel.tsx` | Bulk mark overdue follow-ups done |

---

## Task 1: Today UX improvements

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/TodayPanel.tsx`

Three changes:

### 1a — Default tab → "today"

In `app/page.tsx`, change:
```typescript
const [activeTab, setActiveTab] = useState<AppTab>("scan");
```
to:
```typescript
const [activeTab, setActiveTab] = useState<AppTab>("today");
```

### 1b — Today tab badge

The badge should show the total count of: pending tasks due today or overdue + overdue follow-up contacts.

In `app/page.tsx`, add state alongside `overdueCount`:
```typescript
const [todayTaskCount, setTodayTaskCount] = useState(0);
```

Add import at top:
```typescript
import { getTasks } from "@/lib/tasks";
import { onTasksChanged } from "@/lib/tasks";
```

Add a useEffect (similar to the existing overdueCount one):
```typescript
useEffect(() => {
  const update = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const pending = getTasks().filter((t) => t.date <= todayStr && !t.done).length;
    setTodayTaskCount(pending + getOverdueFollowUps().length);
  };
  update();
  const unsubTasks = onTasksChanged(update);
  const unsubContacts = onContactsChanged(update);
  return () => { unsubTasks(); unsubContacts(); };
}, []);
```

In the nav tabs map, add badge for "today" tab (similar to contacts badge):
```typescript
{tab === "today" && todayTaskCount > 0 && (
  <span style={{
    position: "absolute",
    top: "4px",
    right: "8px",
    background: "var(--amber)",
    color: "#000",
    fontSize: "9px",
    borderRadius: "50%",
    width: "16px",
    height: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  }}>
    {todayTaskCount > 99 ? "99+" : todayTaskCount}
  </span>
)}
```

### 1c — Midnight refresh in TodayPanel

In `components/TodayPanel.tsx`, add a useEffect that schedules a refresh at midnight:

Add after the existing useEffect:
```typescript
useEffect(() => {
  function scheduleRefresh() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      refreshTasks();
      refreshFollowUps();
      scheduleRefresh();
    }, msUntilMidnight);
    return timer;
  }
  const timer = scheduleRefresh();
  return () => clearTimeout(timer);
}, [refreshTasks, refreshFollowUps]);
```

- [ ] **Step 1: Apply changes 1a, 1b, 1c**
- [ ] **Step 2: Verify TypeScript compiles** — `cd /Users/sm/building-finder && npx tsc --noEmit`
- [ ] **Step 3: Commit** — `git add app/page.tsx components/TodayPanel.tsx && git commit -m "feat: Today tab default, badge count, midnight refresh"`

---

## Task 2: Extract lib/wa-templates.ts

**Files:**
- Create: `lib/wa-templates.ts`
- Modify: `components/ResultsList.tsx`

Move ALL of the following from `ResultsList.tsx` into a new `lib/wa-templates.ts`:

```typescript
export interface WaTemplate {
  id: string;
  label: string;
  body: string;
}

export const TEMPLATES_KEY = "urbscan_wa_templates";
export const LAST_TEMPLATE_KEY = "urbscan_wa_last_template";

export const DEFAULT_TEMPLATES: WaTemplate[] = [
  {
    id: "intro",
    label: "Initial Outreach",
    body: "Hi, I'm {name} from {company}.\n\nI came across {lead} and believe we could offer something valuable for your business.\n\nWould you be open to a quick chat? 😊",
  },
  {
    id: "followup",
    label: "Follow Up",
    body: "Hi there,\n\nThis is {name} from {company}. I reached out to {lead} recently and wanted to follow up.\n\nWould you have a moment to connect this week? 🙏",
  },
  {
    id: "pitch",
    label: "Product Pitch",
    body: "Hi {lead},\n\nI'm {name} from {company}. We help businesses like yours with [your service/product].\n\nI'd love to share more — would you be interested? 📋",
  },
  {
    id: "meeting",
    label: "Meeting Request",
    body: "Hi, I'm {name} from {company}.\n\nI'd like to arrange a brief 15–20 min visit with {lead}'s team.\n\nWould this week or next work for you?",
  },
];

export function loadTemplates(): WaTemplate[] {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES;
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw) as WaTemplate[];
    return parsed.length > 0 ? parsed : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export function persistTemplates(templates: WaTemplate[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export function loadLastTemplateId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LAST_TEMPLATE_KEY) ?? "";
}

export function saveLastTemplateId(id: string): void {
  localStorage.setItem(LAST_TEMPLATE_KEY, id);
}

export function loadPhoneTemplateId(phoneDigits: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`urbscan_wa_tmpl_${phoneDigits}`) ?? "";
}

export function savePhoneTemplateId(phoneDigits: string, id: string): void {
  localStorage.setItem(`urbscan_wa_tmpl_${phoneDigits}`, id);
}

export function interpolateTemplate(body: string, lead: string, name: string, company: string): string {
  return body
    .replace(/\{lead\}/g, lead || "[Lead Company]")
    .replace(/\{name\}/g, name || "[Your Name]")
    .replace(/\{company\}/g, company || "[Your Company]");
}
```

Then in `ResultsList.tsx`:
- Delete the lines for: `WaTemplate` interface, `TEMPLATES_KEY`, `LAST_TEMPLATE_KEY`, `DEFAULT_TEMPLATES`, `loadTemplates`, `persistTemplates`, `loadLastTemplateId`, `saveLastTemplateId`, `loadPhoneTemplateId`, `savePhoneTemplateId`, `interpolateTemplate`
- Add import at top: `import { WaTemplate, DEFAULT_TEMPLATES, TEMPLATES_KEY, LAST_TEMPLATE_KEY, loadTemplates, persistTemplates, loadLastTemplateId, saveLastTemplateId, loadPhoneTemplateId, savePhoneTemplateId, interpolateTemplate } from "@/lib/wa-templates";`

- [ ] **Step 1: Create `lib/wa-templates.ts`** with the full content above
- [ ] **Step 2: Update `components/ResultsList.tsx`** — remove moved code, add import
- [ ] **Step 3: Verify TypeScript compiles** — `cd /Users/sm/building-finder && npx tsc --noEmit`
- [ ] **Step 4: Commit** — `git add lib/wa-templates.ts components/ResultsList.tsx && git commit -m "refactor: extract wa-templates lib from ResultsList"`

---

## Task 3: Extract components/WhatsAppComposer.tsx

**Files:**
- Create: `components/WhatsAppComposer.tsx`
- Modify: `components/ResultsList.tsx`

Move `ComposerProps` interface and `WhatsAppComposer` function (currently lines 234–555 in ResultsList.tsx) into a new file.

The new file `components/WhatsAppComposer.tsx` needs:
- `"use client";` directive
- All React imports it uses: `useState`, `useRef`, `useCallback`, `useEffect`
- Import from `@/lib/wa-templates`: all the helpers
- The `ComposerProps` interface (exported)
- The `WhatsAppComposer` function (exported as default AND named, so ResultsList can import it)

Read lines 234-555 of the current `ResultsList.tsx` to get the exact code, then:
1. Create `components/WhatsAppComposer.tsx` with `"use client";` at top, proper imports from `@/lib/wa-templates`, and the full `ComposerProps` + `WhatsAppComposer` code
2. In `ResultsList.tsx`: delete lines 234-555, add `import WhatsAppComposer, { ComposerProps } from "@/components/WhatsAppComposer";`

**Important:** The `whatsappLink` and `whatsappTemplateLink` helper functions are used inside `WhatsAppComposer`. Check if they are also used elsewhere in `ResultsList.tsx`. If they are only used inside `WhatsAppComposer`, move them into `WhatsAppComposer.tsx`. If used elsewhere too, keep them in `ResultsList.tsx` and import them into `WhatsAppComposer.tsx` — but since they're small private helpers, it's simpler to just duplicate them in both files.

- [ ] **Step 1: Read lines 234-555 of ResultsList.tsx** to get exact WhatsAppComposer code
- [ ] **Step 2: Check whatsappLink/whatsappTemplateLink usage** — `grep -n "whatsappLink\|whatsappTemplateLink" components/ResultsList.tsx`
- [ ] **Step 3: Create `components/WhatsAppComposer.tsx`** with proper imports and the extracted code
- [ ] **Step 4: Update `components/ResultsList.tsx`** — remove extracted code, add import
- [ ] **Step 5: Verify TypeScript compiles** — `cd /Users/sm/building-finder && npx tsc --noEmit`
- [ ] **Step 6: Commit** — `git add components/WhatsAppComposer.tsx components/ResultsList.tsx && git commit -m "refactor: extract WhatsAppComposer component from ResultsList"`

---

## Task 4: Contacts bulk mark done

**Files:**
- Modify: `components/ContactsPanel.tsx`

Add a "Mark all done" action for overdue follow-ups. Place it near the stats row, only visible when there are overdue contacts.

In `ContactsPanel.tsx`:

1. Import `updateContact` — it's already imported.

2. Add a handler function in the component:
```typescript
function handleMarkAllOverdueDone() {
  const today = new Date().toISOString().slice(0, 10);
  contacts
    .filter((c) => !c.followUpDone && c.followUpAt && c.followUpAt < today)
    .forEach((c) => updateContact(c.id, { followUpDone: true }));
}
```

3. Find where `stats.overdue` is displayed in the stat cards area. Below the stats row (after the `</div>` that closes the stats flex row), add:

```typescript
{stats.overdue > 0 && (
  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
    <button
      onClick={handleMarkAllOverdueDone}
      style={{
        fontSize: "12px",
        padding: "5px 14px",
        borderRadius: "6px",
        border: "1px solid rgba(224,85,85,0.4)",
        background: "rgba(224,85,85,0.08)",
        color: "#e05555",
        cursor: "pointer",
        fontFamily: "var(--font-ui)",
      }}
    >
      ✓ Mark all {stats.overdue} overdue done
    </button>
  </div>
)}
```

- [ ] **Step 1: Add `handleMarkAllOverdueDone` function** inside the ContactsPanel component
- [ ] **Step 2: Add the button** below the stats row, conditional on `stats.overdue > 0`
- [ ] **Step 3: Verify TypeScript compiles** — `cd /Users/sm/building-finder && npx tsc --noEmit`
- [ ] **Step 4: Commit** — `git add components/ContactsPanel.tsx && git commit -m "feat: bulk mark all overdue follow-ups done"`

---

## Self-Review

**Coverage:**
- ✅ Default tab Today — Task 1a
- ✅ Today badge count — Task 1b
- ✅ Midnight refresh — Task 1c
- ✅ wa-templates extracted — Task 2
- ✅ WhatsAppComposer extracted — Task 3
- ✅ ResultsList shrinks from 1300 → ~850 lines after Tasks 2+3
- ✅ Contacts bulk done — Task 4

**Risks:**
- Task 3 is a refactor — must verify TypeScript compiles and that the composer still works
- Tasks 2 and 3 must be done in order (Task 3 depends on Task 2's lib)
