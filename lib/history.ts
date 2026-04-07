const HISTORY_KEY = "urbscan_history";
const MAX_HISTORY = 5;

export interface HistoryEntry {
  address: string;
  lat: number;
  lng: number;
  timestamp: number;
}

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pushHistory(entry: Omit<HistoryEntry, "timestamp">): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getHistory().filter((h) => h.address !== entry.address);
    const updated = [{ ...entry, timestamp: Date.now() }, ...existing].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}
