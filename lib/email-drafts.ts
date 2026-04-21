import { EmailDraft } from "@/types";

const KEY = "urbscan_email_drafts";
const EVENT = "urbscan:email-drafts:changed";

function notify(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function onEmailDraftsChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

function load(): EmailDraft[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as EmailDraft[];
  } catch {
    return [];
  }
}

function save(data: EmailDraft[]): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getEmailDrafts(): EmailDraft[] {
  return load().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addEmailDraft(draft: Omit<EmailDraft, "id" | "createdAt">): EmailDraft {
  const entry: EmailDraft = {
    ...draft,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  save([entry, ...load()]);
  notify();
  return entry;
}

export function updateEmailDraft(id: string, updates: Partial<EmailDraft>): void {
  save(load().map((d) => (d.id === id ? { ...d, ...updates } : d)));
  notify();
}

export function deleteEmailDraft(id: string): void {
  save(load().filter((d) => d.id !== id));
  notify();
}

export function markEmailSent(id: string): void {
  updateEmailDraft(id, { status: "sent", sentAt: new Date().toISOString() });
}
