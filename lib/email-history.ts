export interface EmailRecord {
  id: string;
  createdAt: string;
  url: string;
  companyName: string;
  subject: string;
  body: string;
  emailType: "cold" | "followup" | "proposal";
  language: "en" | "zh";
  notionSaved: boolean;
  linkedBuildingId?: string;
  linkedBuildingName?: string;
  pipelineStage?: "outreach" | "followup" | "closed_won" | "closed_lost";
}

const STORAGE_KEY = "emailHistory";
const MAX_RECORDS = 100;

export function loadEmailHistory(): EmailRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveEmailRecord(record: Omit<EmailRecord, "id" | "createdAt" | "notionSaved">): EmailRecord {
  const newRecord: EmailRecord = {
    ...record,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    notionSaved: false,
  };
  const history = loadEmailHistory();
  const updated = [newRecord, ...history].slice(0, MAX_RECORDS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newRecord;
}

export function markNotionSaved(id: string): void {
  const history = loadEmailHistory();
  const updated = history.map((r) => r.id === id ? { ...r, notionSaved: true } : r);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function deleteEmailRecord(id: string): void {
  const history = loadEmailHistory();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.filter((r) => r.id !== id)));
}

export function updateEmailRecord(id: string, updates: Partial<EmailRecord>): void {
  const history = loadEmailHistory();
  const updated = history.map((r) => r.id === id ? { ...r, ...updates } : r);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
