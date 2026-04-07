import { Building, SearchParams } from "@/types";

const CACHE_PREFIX = "urbscan_cache_";
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry { buildings: Building[]; timestamp: number; }

function cacheKey(params: SearchParams): string {
  const locs = params.locations.map((l) => `${l.lat.toFixed(4)},${l.lng.toFixed(4)}`).join("|");
  return `${CACHE_PREFIX}${locs}_${params.radius}_${params.industry}_${params.keyword}`;
}

export function getCached(params: SearchParams): Building[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(params));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) { sessionStorage.removeItem(cacheKey(params)); return null; }
    return entry.buildings;
  } catch { return null; }
}

export function setCached(params: SearchParams, buildings: Building[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(cacheKey(params), JSON.stringify({ buildings, timestamp: Date.now() }));
  } catch { /* ignore */ }
}
