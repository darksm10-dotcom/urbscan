import { Building, SearchParams } from "@/types";
import { getCached, setCached } from "@/lib/cache";

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
