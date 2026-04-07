import { Building, SearchLocation } from "@/types";

function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Nearest-neighbour TSP starting from the given origin.
 * Returns buildings re-ordered for an efficient visit route.
 */
export function optimizeRoute(buildings: Building[], origin: SearchLocation): Building[] {
  if (buildings.length <= 1) return buildings;

  const unvisited = [...buildings];
  const route: Building[] = [];
  let current: { lat: number; lng: number } = origin;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const d = dist(current, unvisited[i]);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const next = unvisited.splice(nearestIdx, 1)[0];
    route.push(next);
    current = next;
  }

  return route;
}

/** Total route distance in meters */
export function totalRouteDistance(buildings: Building[], origin: SearchLocation): number {
  if (buildings.length === 0) return 0;
  let total = dist(origin, buildings[0]);
  for (let i = 1; i < buildings.length; i++) {
    total += dist(buildings[i - 1], buildings[i]);
  }
  return Math.round(total);
}
