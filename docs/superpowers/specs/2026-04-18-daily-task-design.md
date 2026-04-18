# Daily Task Feature — Design Spec

**Date:** 2026-04-18  
**Project:** Urbscan (building-finder)  
**Status:** Approved

---

## Overview

Add a "Today" tab to Urbscan that serves as a daily work dashboard. It combines two things: standalone to-do tasks (with title + date) and an auto-pulled view of follow-ups due today from the existing contacts system.

---

## Data Model

New type added to `types/index.ts`:

```ts
export interface Task {
  id: string;
  title: string;
  date: string;      // YYYY-MM-DD
  done: boolean;
  createdAt: string; // ISO datetime
}
```

---

## New Files

### `lib/tasks.ts`

Follows the same pattern as `lib/contacts.ts`:

- `localStorage` key: `urbscan_tasks`
- CustomEvent: `urbscan:tasks:changed`
- Exports:
  - `getTasks(): Task[]` — all tasks sorted by date asc
  - `getTasksForDate(date: string): Task[]` — tasks for a specific YYYY-MM-DD
  - `addTask(data: Omit<Task, "id" | "createdAt">): Task`
  - `toggleTask(id: string): void` — flips `done`
  - `deleteTask(id: string): void`
  - `onTasksChanged(handler: () => void): () => void`

### `components/TodayPanel.tsx`

Two sections rendered top-to-bottom:

**Section 1 — My Tasks**
- Input row: text field + date picker (defaults to today) + "Add" button
- Task list: shows tasks where `date <= today` and not done, plus today's done tasks (greyed out)
- Each task row: checkbox (toggles done), title, date badge (if not today), delete button
- Empty state: "Nothing on your list — add a task above"

**Section 2 — Follow-ups Due Today**
- Auto-pulls from `getOverdueFollowUps()` (already exists in `lib/contacts.ts`)
- Read-only cards showing: building name, contact method, note snippet
- Each card has a "→ Contacts" link that switches the active tab to `contacts`
- Empty state: "No follow-ups due today"

---

## Changes to Existing Files

### `types/index.ts`
- Add `Task` interface

### `app/page.tsx`
- Add `"today"` to the `AppTab` union type
- Add "Today" button to the header nav tabs
- Add `TodayPanel` to the tab render switch
- Pass `onGoToContacts` callback to `TodayPanel` so clicking a follow-up card switches to the contacts tab

### Header nav tab order
`Today | Scan | Contacts | Notes`

---

## Behaviour Details

- Tasks with `date < today` that are not done are shown in My Tasks (overdue, not hidden)
- Tasks with `date > today` are not shown in Today view (they belong to future days)
- Follow-ups section uses existing `getOverdueFollowUps()` which returns contacts where `followUpAt <= today` and `followUpDone === false`
- No badge/counter on the Today tab (kept simple for now)

---

## Out of Scope

- Task editing (only add/delete/toggle)
- Priority or notes on tasks
- Inline follow-up completion (handled in Contacts tab)
- Recurring tasks
- Notifications / reminders
