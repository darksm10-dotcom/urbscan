import { ContactLog } from "@/types";

const KEY = "urbscan_contacts";
const EVENT = "urbscan:contacts:changed";

function notify(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function onContactsChanged(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

function load(): ContactLog[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ContactLog[];
  } catch {
    return [];
  }
}

function save(data: ContactLog[]): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getContacts(): ContactLog[] {
  return load().sort((a, b) => b.contactedAt.localeCompare(a.contactedAt));
}

export function getContactsForBuilding(buildingId: string): ContactLog[] {
  return load()
    .filter((c) => c.buildingId === buildingId)
    .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt));
}

export function addContact(log: Omit<ContactLog, "id">): ContactLog {
  const entry: ContactLog = { ...log, id: crypto.randomUUID() };
  save([entry, ...load()]);
  notify();
  return entry;
}

export function updateContact(id: string, updates: Partial<ContactLog>): void {
  save(load().map((c) => (c.id === id ? { ...c, ...updates } : c)));
  notify();
}

export function deleteContact(id: string): void {
  save(load().filter((c) => c.id !== id));
  notify();
}

export function getOverdueFollowUps(): ContactLog[] {
  const today = new Date().toISOString().slice(0, 10);
  return load().filter((c) => !c.followUpDone && c.followUpAt && c.followUpAt <= today);
}

export function googleCalendarLink(c: ContactLog): string {
  const start = (c.followUpAt ?? "").replace(/-/g, "");
  const nextDay = new Date(c.followUpAt!);
  nextDay.setDate(nextDay.getDate() + 1);
  const end = nextDay.toISOString().slice(0, 10).replace(/-/g, "");
  const details = [
    `Follow up with ${c.buildingName}`,
    c.buildingPhone ? `Phone: ${c.buildingPhone}` : "",
    c.note ? `Notes: ${c.note}` : "",
  ].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Follow up: ${c.buildingName}`,
    dates: `${start}/${end}`,
    details,
  });
  if (c.buildingAddress) params.set("location", c.buildingAddress);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function getDueThisWeek(): ContactLog[] {
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const todayStr = today.toISOString().slice(0, 10);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);
  return load().filter(
    (c) => !c.followUpDone && c.followUpAt && c.followUpAt >= todayStr && c.followUpAt <= weekEndStr
  );
}
