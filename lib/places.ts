import { Building, SearchParams } from "@/types";
import { getCached, setCached } from "@/lib/cache";
import { INDUSTRY_KEYWORDS } from "@/lib/keywords";

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=MY&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" || !data.results.length) throw new Error("找不到该地址，请检查输入");
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}

export async function searchNearbyBuildings(params: SearchParams, signal?: AbortSignal): Promise<Building[]> {
  const cached = getCached(params);
  if (cached) return cached;

  const res = await fetch("/api/nearby", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: params.locations,
      radius: params.radius,
      buildingType: params.buildingType,
      industry: params.industry,
      keyword: params.keyword,
    }),
    signal,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "查询失败");

  const buildings = data.buildings as Building[];
  setCached(params, buildings);
  return buildings;
}

export async function searchNearbyBuildingsIncremental(
  params: SearchParams,
  onUpdate: (done: number, total: number, buildings: Building[]) => void,
  signal?: AbortSignal
): Promise<Building[]> {
  const cached = getCached(params);
  if (cached) { onUpdate(1, 1, cached); return cached; }

  const industryKws = INDUSTRY_KEYWORDS[params.industry] ?? INDUSTRY_KEYWORDS.all;
  const queries = params.keyword?.trim()
    ? [...industryKws, params.keyword.trim()]
    : industryKws;

  const tasks = params.locations.flatMap((loc) =>
    queries.map((q) => ({ loc, q }))
  );

  const seen = new Set<string>();
  let accumulated: Building[] = [];
  let done = 0;
  const total = tasks.length;

  await Promise.all(
    tasks.map(async ({ loc, q }) => {
      try {
        const res = await fetch("/api/nearby", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locations: [loc],
            radius: params.radius,
            industry: params.industry,
            queries: [q],
          }),
          signal,
        });
        const data = await res.json();
        if (res.ok) {
          const fresh = (data.buildings as Building[]).filter((b) => {
            if (seen.has(b.id)) return false;
            seen.add(b.id);
            return true;
          });
          accumulated = [...accumulated, ...fresh].sort((a, b) => b.score - a.score);
        }
      } catch { /* AbortError or network — skip */ }
      done++;
      onUpdate(done, total, [...accumulated]);
    })
  );

  setCached(params, accumulated);
  return accumulated;
}
