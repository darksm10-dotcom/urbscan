import { Building, SearchParams } from "@/types";

const KEY = "urbscan_last_scan";

interface ScanSnapshot {
  buildings: Building[];
  params: SearchParams;
  savedAt: string;
}

export function saveLastScan(buildings: Building[], params: SearchParams): void {
  if (typeof window === "undefined") return;
  try {
    const snapshot: ScanSnapshot = { buildings, params, savedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota errors
  }
}

export function loadLastScan(): ScanSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScanSnapshot;
  } catch {
    return null;
  }
}
