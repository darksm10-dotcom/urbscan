import { LeadStatus, PipelineEntry } from "@/types";

const KEY = "urbscan_pipeline";

function load(): Record<string, PipelineEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function save(data: Record<string, PipelineEntry>): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getPipelineData(): Record<string, PipelineEntry> {
  return load();
}

export function setLeadStatus(id: string, status: LeadStatus): void {
  const data = load();
  data[id] = { status, note: data[id]?.note ?? "", updatedAt: new Date().toISOString() };
  save(data);
}

export function setLeadNote(id: string, note: string): void {
  const data = load();
  const now = new Date().toISOString();
  data[id] = {
    status: data[id]?.status ?? "new",
    note,
    updatedAt: data[id]?.updatedAt ?? now,
    noteUpdatedAt: now,
  };
  save(data);
}
