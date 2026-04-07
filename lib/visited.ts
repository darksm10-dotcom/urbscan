const VISITED_KEY = "urbscan_visited";

export function getVisited(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    return new Set(JSON.parse(raw ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function toggleVisited(id: string): boolean {
  const visited = getVisited();
  if (visited.has(id)) {
    visited.delete(id);
  } else {
    visited.add(id);
  }
  localStorage.setItem(VISITED_KEY, JSON.stringify([...visited]));
  return visited.has(id);
}

export function markVisited(id: string): void {
  const visited = getVisited();
  visited.add(id);
  localStorage.setItem(VISITED_KEY, JSON.stringify([...visited]));
}
