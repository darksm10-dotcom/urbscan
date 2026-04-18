import { Task } from "@/types";

const KEY = "urbscan_tasks";
const EVENT = "urbscan:tasks:changed";

function notify(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function onTasksChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

function load(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Task[];
  } catch {
    return [];
  }
}

function save(data: Task[]): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getTasks(): Task[] {
  return load().sort((a, b) => a.date.localeCompare(b.date));
}

export function getTasksForDate(date: string): Task[] {
  return load()
    .filter((t) => t.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addTask(data: Omit<Task, "id" | "createdAt">): Task {
  const task: Task = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  save([...load(), task]);
  notify();
  return task;
}

export function toggleTask(id: string): void {
  save(load().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  notify();
}

export function deleteTask(id: string): void {
  save(load().filter((t) => t.id !== id));
  notify();
}
