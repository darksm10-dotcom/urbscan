# Daily Task Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Today" tab to Urbscan showing today's standalone tasks (add/toggle/delete) and follow-ups due today (read-only, pulled from contacts).

**Architecture:** New `lib/tasks.ts` handles Task CRUD in localStorage (same pattern as `lib/contacts.ts`). New `components/TodayPanel.tsx` renders two sections: My Tasks and Follow-ups Due Today. `app/page.tsx` gets a new `"today"` tab wired up.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, localStorage, inline styles (no Tailwind classes used in this project's components)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `types/index.ts` | Add `Task` interface |
| Create | `lib/tasks.ts` | Task CRUD, localStorage, event broadcast |
| Create | `components/TodayPanel.tsx` | Today tab UI |
| Modify | `app/page.tsx` | Add `"today"` to `AppTab`, wire up tab + component |

---

## Task 1: Add Task type

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add the Task interface** — open `types/index.ts` and append after the last export:

```typescript
export interface Task {
  id: string;
  title: string;
  date: string;      // YYYY-MM-DD
  done: boolean;
  createdAt: string; // ISO datetime
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/sm/building-finder && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/sm/building-finder && git add types/index.ts && git commit -m "feat: add Task type"
```

---

## Task 2: Create lib/tasks.ts

**Files:**
- Create: `lib/tasks.ts`

- [ ] **Step 1: Create the file with full implementation**

Create `/Users/sm/building-finder/lib/tasks.ts`:

```typescript
import { Task } from "@/types";

const KEY = "urbscan_tasks";
const EVENT = "urbscan:tasks:changed";

function notify(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function onTasksChanged(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

function load(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Task[];
  } catch {
    return [];
  }
}

function save(data: Task[]): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getTasks(): Task[] {
  return load().sort((a, b) => a.date.localeCompare(b.date));
}

export function getTasksForDate(date: string): Task[] {
  return load()
    .filter((t) => t.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addTask(data: Omit<Task, "id" | "createdAt">): Task {
  const task: Task = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  save([...load(), task]);
  notify();
  return task;
}

export function toggleTask(id: string): void {
  save(load().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  notify();
}

export function deleteTask(id: string): void {
  save(load().filter((t) => t.id !== id));
  notify();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/sm/building-finder && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test in browser console**

Start dev server (`npm run dev`), open browser console on `http://localhost:3000`, paste:

```js
// Should not throw
const tasks = JSON.parse(localStorage.getItem("urbscan_tasks") ?? "[]");
console.log("tasks:", tasks); // []
```

Expected: logs `tasks: []`

- [ ] **Step 4: Commit**

```bash
cd /Users/sm/building-finder && git add lib/tasks.ts && git commit -m "feat: add tasks lib with localStorage CRUD"
```

---

## Task 3: Create TodayPanel component

**Files:**
- Create: `components/TodayPanel.tsx`

- [ ] **Step 1: Create the file**

Create `/Users/sm/building-finder/components/TodayPanel.tsx`:

```typescript
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Task } from "@/types";
import { getTasks, addTask, toggleTask, deleteTask, onTasksChanged } from "@/lib/tasks";
import { getOverdueFollowUps, onContactsChanged } from "@/lib/contacts";
import { ContactLog } from "@/types";

const today = () => new Date().toISOString().slice(0, 10);

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  const isOverdue = task.date < today() && !task.done;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "10px 12px",
      borderRadius: "8px",
      background: "var(--bg-elevated)",
      opacity: task.done ? 0.5 : 1,
    }}>
      <input
        type="checkbox"
        checked={task.done}
        onChange={onToggle}
        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--amber)", flexShrink: 0 }}
      />
      <span style={{
        flex: 1,
        fontSize: "14px",
        color: "var(--text-primary)",
        textDecoration: task.done ? "line-through" : "none",
      }}>
        {task.title}
      </span>
      {task.date !== today() && (
        <span style={{
          fontSize: "11px",
          padding: "2px 7px",
          borderRadius: "4px",
          background: isOverdue ? "rgba(239,68,68,0.15)" : "var(--bg-card)",
          color: isOverdue ? "#ef4444" : "var(--text-dim)",
          fontWeight: 500,
        }}>
          {task.date}
        </span>
      )}
      <button
        onClick={onDelete}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-dim)",
          cursor: "pointer",
          fontSize: "16px",
          lineHeight: 1,
          padding: "0 2px",
          flexShrink: 0,
        }}
        title="Delete task"
      >
        ×
      </button>
    </div>
  );
}

function FollowUpCard({ contact, onGoToContacts }: { contact: ContactLog; onGoToContacts: () => void }) {
  const methodLabel: Record<ContactLog["method"], string> = {
    whatsapp: "WhatsApp",
    call: "Call",
    email: "Email",
    visit: "Visit",
    other: "Other",
  };
  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: "8px",
      background: "var(--bg-elevated)",
      borderLeft: "3px solid var(--amber)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            {contact.buildingName}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {methodLabel[contact.method]}
            {contact.note ? ` · ${contact.note.slice(0, 60)}${contact.note.length > 60 ? "…" : ""}` : ""}
          </div>
        </div>
        <button
          onClick={onGoToContacts}
          style={{
            fontSize: "12px",
            padding: "4px 10px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            flexShrink: 0,
            fontFamily: "var(--font-ui)",
          }}
        >
          → Contacts
        </button>
      </div>
    </div>
  );
}

export default function TodayPanel({ onGoToContacts }: { onGoToContacts: () => void }) {
  const todayStr = today();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [followUps, setFollowUps] = useState<ContactLog[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr);

  const refreshTasks = useCallback(() => {
    const all = getTasks();
    // Show tasks due today or overdue (date <= today), including done tasks from today
    setTasks(all.filter((t) => t.date <= todayStr));
  }, [todayStr]);

  const refreshFollowUps = useCallback(() => {
    setFollowUps(getOverdueFollowUps());
  }, []);

  useEffect(() => {
    refreshTasks();
    refreshFollowUps();
    const unsubTasks = onTasksChanged(refreshTasks);
    const unsubContacts = onContactsChanged(refreshFollowUps);
    return () => {
      unsubTasks();
      unsubContacts();
    };
  }, [refreshTasks, refreshFollowUps]);

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({ title: trimmed, date, done: false });
    setTitle("");
    setDate(todayStr);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAdd();
  }

  const pendingTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  return (
    <div style={{
      flex: 1,
      padding: "32px 40px",
      overflowY: "auto",
      maxWidth: "720px",
      display: "flex",
      flexDirection: "column",
      gap: "32px",
    }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
          Today
        </div>
        <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          {new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      {/* My Tasks section */}
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>
          My Tasks
        </div>

        {/* Add task row */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a task…"
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-ui)",
              outline: "none",
            }}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              padding: "9px 10px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontFamily: "var(--font-ui)",
              outline: "none",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!title.trim()}
            style={{
              padding: "9px 16px",
              borderRadius: "8px",
              border: "none",
              background: title.trim() ? "var(--amber)" : "var(--bg-elevated)",
              color: title.trim() ? "#000" : "var(--text-dim)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: title.trim() ? "pointer" : "default",
              fontFamily: "var(--font-ui)",
              transition: "all 0.15s",
            }}
          >
            Add
          </button>
        </div>

        {/* Task list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {pendingTasks.length === 0 && doneTasks.length === 0 && (
            <div style={{ fontSize: "14px", color: "var(--text-dim)", padding: "12px 0" }}>
              Nothing on your list — add a task above
            </div>
          )}
          {pendingTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => toggleTask(task.id)}
              onDelete={() => deleteTask(task.id)}
            />
          ))}
          {doneTasks.length > 0 && (
            <>
              <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "8px", marginBottom: "4px", letterSpacing: "0.04em" }}>
                DONE
              </div>
              {doneTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask(task.id)}
                  onDelete={() => deleteTask(task.id)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Follow-ups section */}
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>
          Follow-ups Due Today
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {followUps.length === 0 ? (
            <div style={{ fontSize: "14px", color: "var(--text-dim)", padding: "4px 0" }}>
              No follow-ups due today
            </div>
          ) : (
            followUps.map((c) => (
              <FollowUpCard key={c.id} contact={c} onGoToContacts={onGoToContacts} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/sm/building-finder && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/sm/building-finder && git add components/TodayPanel.tsx && git commit -m "feat: add TodayPanel component"
```

---

## Task 4: Wire up Today tab in app/page.tsx

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add the dynamic import for TodayPanel** — in `app/page.tsx`, after the `NotesPanel` import line, add:

```typescript
const TodayPanel    = dynamic(() => import("@/components/TodayPanel"),    { ssr: false });
```

- [ ] **Step 2: Add `"today"` to the AppTab union** — change:

```typescript
type AppTab = "scan" | "contacts" | "notes";
```

to:

```typescript
type AppTab = "today" | "scan" | "contacts" | "notes";
```

- [ ] **Step 3: Update the header nav tabs array** — change:

```typescript
          {([
            { tab: "scan",     label: "Scan" },
            { tab: "contacts", label: "Contacts" },
            { tab: "notes",    label: "Notes" },
          ] as { tab: AppTab; label: string }[]).map(({ tab, label }) => (
```

to:

```typescript
          {([
            { tab: "today",    label: "Today" },
            { tab: "scan",     label: "Scan" },
            { tab: "contacts", label: "Contacts" },
            { tab: "notes",    label: "Notes" },
          ] as { tab: AppTab; label: string }[]).map(({ tab, label }) => (
```

- [ ] **Step 4: Add the Today tab render** — in the main content area, the current structure is:

```typescript
        {activeTab === "scan" ? (
          ...
        ) : activeTab === "contacts" ? (
          ...
        ) : (
          // notes
        )}
```

Change it to:

```typescript
        {activeTab === "today" ? (
          <section style={{ flex: 1, display: "flex", minHeight: 0, overflow: "auto" }}>
            <TodayPanel onGoToContacts={() => setActiveTab("contacts")} />
          </section>
        ) : activeTab === "scan" ? (
          <>
            <aside
              className="sidebar"
              style={{
                width: "320px",
                flexShrink: 0,
                borderRight: "1px solid var(--border)",
                padding: "20px 16px",
                background: "var(--bg-card)",
                overflowY: "auto",
              }}
            >
              <SearchPanel onSearch={handleSearch} loading={loading} />
            </aside>
            <section style={{
              flex: 1,
              padding: "20px 24px",
              overflowY: "auto",
              overflowX: "hidden",
              minWidth: 0,
            }}>
              <ResultsList
                buildings={buildings}
                loading={loading}
                error={error}
                searched={searched}
                lastParams={lastParams}
                selectedId={selectedId}
                onSelectId={setSelectedId}
              />
            </section>
          </>
        ) : activeTab === "contacts" ? (
          <section style={{
            flex: 1,
            padding: "32px 40px",
            overflowY: "auto",
            minWidth: 0,
            maxWidth: "900px",
          }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                Contacts
              </div>
              <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                Manage your outreach pipeline and follow-ups
              </div>
            </div>
            <ContactsPanel />
          </section>
        ) : (
          <section style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
            <NotesPanel />
          </section>
        )}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/sm/building-finder && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual end-to-end test in browser**

Start dev server: `npm run dev`, open `http://localhost:3000`

Check these scenarios:

1. Click "Today" tab — panel loads with date header, empty My Tasks, empty Follow-ups
2. Type a task title, click Add — task appears in list
3. Check the checkbox — task moves to DONE section with strikethrough
4. Click × — task is removed
5. Add a task with tomorrow's date — it should NOT appear in Today tab
6. Go to Contacts tab, mark a contact's follow-up date as today — return to Today, it should appear in Follow-ups Due Today
7. Click "→ Contacts" on a follow-up card — switches to Contacts tab
8. Reload the page — tasks persist (localStorage)

- [ ] **Step 7: Commit**

```bash
cd /Users/sm/building-finder && git add app/page.tsx && git commit -m "feat: add Today tab with daily tasks and follow-ups"
```

---

## Self-Review

**Spec coverage:**
- ✅ New "Today" tab — Task 4
- ✅ Standalone tasks with title + date + checkbox — Tasks 2, 3
- ✅ Add/toggle/delete tasks — `lib/tasks.ts` + `TaskRow`
- ✅ Future tasks (date > today) hidden from Today view — `refreshTasks` filter
- ✅ Follow-ups due today pulled from `getOverdueFollowUps()` — `FollowUpCard`
- ✅ Follow-up cards are read-only with "→ Contacts" link — `FollowUpCard` + `onGoToContacts` prop
- ✅ Tab order: Today | Scan | Contacts | Notes — Task 4 Step 3
- ✅ Overdue incomplete tasks shown — filter is `t.date <= todayStr`

**Placeholder scan:** None found.

**Type consistency:**
- `Task` defined in `types/index.ts` Task 1, used in `lib/tasks.ts` Task 2 and `TodayPanel.tsx` Task 3 — consistent
- `ContactLog` imported from `@/types` in TodayPanel — consistent with existing usage
- `getOverdueFollowUps` imported from `@/lib/contacts` — function already exists, signature unchanged
- `onGoToContacts: () => void` prop passed from `page.tsx` as `() => setActiveTab("contacts")` — consistent
