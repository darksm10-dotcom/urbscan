"use client";

import React, { useState, useEffect, useRef } from "react";

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

const NOTES_KEY = "urbscan_notes";

function loadNotes(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]") as Note[];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

function newNote(): Note {
  const now = new Date().toISOString();
  return { id: `note_${Date.now()}`, title: "", content: "", tags: "", createdAt: now, updatedAt: now };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded = loadNotes();
    setNotes(loaded);
    if (loaded.length > 0) setActiveId(loaded[0].id);
  }, []);

  const active = notes.find((n) => n.id === activeId) ?? null;

  function update(field: keyof Note, value: string) {
    if (!activeId) return;
    const updated = notes.map((n) =>
      n.id === activeId ? { ...n, [field]: value, updatedAt: new Date().toISOString() } : n
    );
    setNotes(updated);
    saveNotes(updated);
  }

  function addNote() {
    const n = newNote();
    const updated = [n, ...notes];
    setNotes(updated);
    saveNotes(updated);
    setActiveId(n.id);
    setTimeout(() => titleRef.current?.focus(), 50);
  }

  function deleteNote(id: string) {
    if (!confirm("Delete this note?")) return;
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    saveNotes(updated);
    setActiveId(updated[0]?.id ?? null);
  }

  async function handleSync() {
    if (notes.length === 0) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/notion/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notes.map((n) => ({
          id: n.id,
          title: n.title || "Untitled",
          content: n.content,
          tags: n.tags,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        }))),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as { created: number; updated: number; deleted: number; errors: string[] };
      const del = result.deleted > 0 ? `, ${result.deleted} deleted` : "";
      const msg = `Synced ${result.created + result.updated} notes (${result.created} new, ${result.updated} updated${del})`;
      setSyncMsg({ text: result.errors.length > 0 ? `${msg} — ${result.errors.length} errors` : msg, ok: result.errors.length === 0 });
    } catch (err) {
      setSyncMsg({ text: `Sync failed: ${err instanceof Error ? err.message : "unknown"}`, ok: false });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
    fontFamily: "var(--font-ui)",
    width: "100%",
  };

  return (
    <div style={{ display: "flex", height: "100%", gap: 0, animation: "fadeSlideIn 0.3s ease" }}>

      {/* Sidebar — note list */}
      <div style={{ width: "240px", flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-card)" }}>

        {/* Sidebar header */}
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>Notes</span>
          <button
            onClick={addNote}
            title="New note"
            style={{ background: "var(--amber)", border: "none", borderRadius: "4px", color: "#000", fontSize: "16px", width: "24px", height: "24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, lineHeight: 1 }}
          >+</button>
        </div>

        {/* Note list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {notes.length === 0 ? (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--text-dim)", fontSize: "12px" }}>
              No notes yet.<br />Click + to create one.
            </div>
          ) : (
            notes.map((n) => {
              const isActive = n.id === activeId;
              return (
                <div
                  key={n.id}
                  onClick={() => setActiveId(n.id)}
                  style={{ padding: "10px 14px", cursor: "pointer", background: isActive ? "var(--bg-elevated)" : "transparent", borderLeft: `3px solid ${isActive ? "var(--amber)" : "transparent"}`, transition: "all 0.1s" }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div style={{ fontSize: "13px", fontWeight: 600, color: isActive ? "var(--text-primary)" : "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>
                    {n.title || <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>Untitled</span>}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.content ? n.content.slice(0, 60) : <span style={{ fontStyle: "italic" }}>Empty</span>}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "4px" }}>
                    {new Date(n.updatedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Notion sync */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
          <button
            onClick={handleSync}
            disabled={syncing || notes.length === 0}
            style={{ width: "100%", fontSize: "12px", padding: "7px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: syncing ? "var(--text-dim)" : "var(--text-secondary)", cursor: syncing || notes.length === 0 ? "not-allowed" : "pointer", opacity: notes.length === 0 ? 0.4 : 1, transition: "all 0.15s" }}
            onMouseEnter={(e) => { if (!syncing && notes.length > 0) { (e.currentTarget as HTMLElement).style.borderColor = "#7c3aed"; (e.currentTarget as HTMLElement).style.color = "#7c3aed"; } }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
          >
            {syncing ? "⏳ Syncing..." : "◈ Sync to Notion"}
          </button>
          {syncMsg && (
            <div style={{ fontSize: "11px", marginTop: "6px", color: syncMsg.ok ? "var(--green-bright)" : "#e05555", lineHeight: 1.4 }}>
              {syncMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      {active ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Editor toolbar */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-card)", flexShrink: 0 }}>
            <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              Updated {formatDate(active.updatedAt)}
            </div>
            <button
              onClick={() => deleteNote(active.id)}
              style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#e05555"; (e.currentTarget as HTMLElement).style.color = "#e05555"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-dim)"; }}
            >Delete</button>
          </div>

          {/* Title */}
          <div style={{ padding: "24px 32px 8px" }}>
            <input
              ref={titleRef}
              value={active.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Note title..."
              style={{ ...inputStyle, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.01em" }}
            />
          </div>

          {/* Tags */}
          <div style={{ padding: "0 32px 16px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Tags:</span>
            <input
              value={active.tags}
              onChange={(e) => update("tags", e.target.value)}
              placeholder="e.g. follow-up, strategy, ideas"
              style={{ ...inputStyle, fontSize: "12px", color: "var(--text-secondary)", flex: 1 }}
            />
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: "0 32px 24px", display: "flex", flexDirection: "column" }}>
            <textarea
              value={active.content}
              onChange={(e) => update("content", e.target.value)}
              placeholder="Start writing..."
              style={{ ...inputStyle, flex: 1, resize: "none", fontSize: "15px", lineHeight: 1.8, color: "var(--text-primary)" } as React.CSSProperties}
            />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px", color: "var(--text-dim)" }}>
          <div style={{ fontSize: "32px" }}>◈</div>
          <div style={{ fontSize: "14px" }}>Click + to create your first note</div>
        </div>
      )}
    </div>
  );
}
