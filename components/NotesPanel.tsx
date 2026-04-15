"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface NoteFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // base64
}

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string;
  files: NoteFile[];
  createdAt: string;
  updatedAt: string;
}

const NOTES_KEY = "urbscan_notes";
const MAX_FILE_MB = 10;

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
  return { id: `note_${Date.now()}`, title: "", content: "", tags: "", files: [], createdAt: now, updatedAt: now };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadFile(f: NoteFile) {
  const a = document.createElement("a");
  a.href = f.data;
  a.download = f.name;
  a.click();
}

export default function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded = loadNotes();
    setNotes(loaded);
    if (loaded.length > 0) setActiveId(loaded[0].id);
  }, []);

  const active = notes.find((n) => n.id === activeId) ?? null;

  function updateNote(patch: Partial<Note>) {
    if (!activeId) return;
    const updated = notes.map((n) =>
      n.id === activeId ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n
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

  const attachFiles = useCallback(async (fileList: FileList | File[]) => {
    if (!activeId) return;
    const files = Array.from(fileList);
    const oversized = files.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (oversized.length > 0) {
      setFileErr(`Files over ${MAX_FILE_MB}MB skipped: ${oversized.map((f) => f.name).join(", ")}`);
      setTimeout(() => setFileErr(null), 4000);
    }
    const ok = files.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    if (ok.length === 0) return;
    const newFiles: NoteFile[] = await Promise.all(
      ok.map(async (f) => ({
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: f.name,
        type: f.type,
        size: f.size,
        data: await fileToBase64(f),
      }))
    );
    const note = notes.find((n) => n.id === activeId);
    if (!note) return;
    updateNote({ files: [...(note.files ?? []), ...newFiles] });
  }, [activeId, notes]);

  function removeFile(fileId: string) {
    const note = notes.find((n) => n.id === activeId);
    if (!note) return;
    updateNote({ files: note.files.filter((f) => f.id !== fileId) });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) attachFiles(e.dataTransfer.files);
  }

  async function handleSync() {
    if (notes.length === 0) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const payload = notes.map((n) => ({
        id: n.id,
        title: n.title || "Untitled",
        content: n.content,
        tags: n.tags,
        // send metadata only — no base64 data to keep payload small
        files: (n.files ?? []).map(({ id, name, type, size }) => ({ id, name, type, size })),
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      }));
      const res = await fetch("/api/notion/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const base: React.CSSProperties = { background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontFamily: "var(--font-ui)", width: "100%" };

  return (
    <div style={{ display: "flex", height: "100%", animation: "fadeSlideIn 0.3s ease" }}>

      {/* ── Sidebar ── */}
      <div style={{ width: "240px", flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-card)" }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Notes</span>
          <button onClick={addNote} title="New note"
            style={{ background: "var(--amber)", border: "none", borderRadius: "4px", color: "#000", fontSize: "16px", width: "24px", height: "24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}
          >+</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {notes.length === 0 ? (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--text-dim)", fontSize: "12px" }}>No notes yet.<br />Click + to create one.</div>
          ) : notes.map((n) => {
            const isActive = n.id === activeId;
            return (
              <div key={n.id} onClick={() => setActiveId(n.id)}
                style={{ padding: "10px 14px", cursor: "pointer", background: isActive ? "var(--bg-elevated)" : "transparent", borderLeft: `3px solid ${isActive ? "var(--amber)" : "transparent"}`, transition: "all 0.1s" }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div style={{ fontSize: "13px", fontWeight: 600, color: isActive ? "var(--text-primary)" : "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "2px" }}>
                  {n.title || <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>Untitled</span>}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {n.content ? n.content.slice(0, 55) : <span style={{ fontStyle: "italic" }}>Empty</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>{new Date(n.updatedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</span>
                  {n.files?.length > 0 && <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>📎 {n.files.length}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
          <button onClick={handleSync} disabled={syncing || notes.length === 0}
            style={{ width: "100%", fontSize: "12px", padding: "7px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: syncing ? "var(--text-dim)" : "var(--text-secondary)", cursor: syncing || notes.length === 0 ? "not-allowed" : "pointer", opacity: notes.length === 0 ? 0.4 : 1, transition: "all 0.15s" }}
            onMouseEnter={(e) => { if (!syncing && notes.length > 0) { (e.currentTarget as HTMLElement).style.borderColor = "#7c3aed"; (e.currentTarget as HTMLElement).style.color = "#7c3aed"; } }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
          >{syncing ? "⏳ Syncing..." : "◈ Sync to Notion"}</button>
          {syncMsg && <div style={{ fontSize: "11px", marginTop: "6px", color: syncMsg.ok ? "var(--green-bright)" : "#e05555", lineHeight: 1.4 }}>{syncMsg.text}</div>}
        </div>
      </div>

      {/* ── Editor ── */}
      {active ? (
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: dragOver ? "rgba(212,160,60,0.04)" : "transparent", transition: "background 0.15s" }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Toolbar */}
          <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "10px", background: "var(--bg-card)", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", color: "var(--text-dim)", flex: 1 }}>Updated {formatDate(active.updatedAt)}</span>

            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }}
              onChange={(e) => { if (e.target.files) { attachFiles(e.target.files); e.target.value = ""; } }}
            />
            <button onClick={() => fileInputRef.current?.click()}
              title="Attach files (or drag & drop)"
              style={{ fontSize: "13px", padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--amber)"; (e.currentTarget as HTMLElement).style.color = "var(--amber)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            >📎 Attach</button>

            <button onClick={() => deleteNote(active.id)}
              style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#e05555"; (e.currentTarget as HTMLElement).style.color = "#e05555"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-dim)"; }}
            >Delete</button>
          </div>

          {/* Drag overlay hint */}
          {dragOver && (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
              <div style={{ background: "var(--bg-elevated)", border: "2px dashed var(--amber)", borderRadius: "12px", padding: "24px 40px", fontSize: "15px", color: "var(--amber)", fontWeight: 600 }}>
                Drop files here
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
            {/* Title */}
            <input ref={titleRef} value={active.title} onChange={(e) => updateNote({ title: e.target.value })}
              placeholder="Note title..."
              style={{ ...base, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.01em", marginBottom: "8px", display: "block" }}
            />

            {/* Tags */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "20px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-dim)", flexShrink: 0 }}>Tags</span>
              <input value={active.tags} onChange={(e) => updateNote({ tags: e.target.value })}
                placeholder="follow-up, strategy, ideas..."
                style={{ ...base, fontSize: "12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", padding: "2px 4px" }}
              />
            </div>

            {/* Content */}
            <textarea value={active.content} onChange={(e) => updateNote({ content: e.target.value })}
              placeholder="Start writing... (drag & drop files anywhere)"
              style={{ ...base, resize: "none", fontSize: "15px", lineHeight: 1.8, minHeight: "200px", display: "block" } as React.CSSProperties}
              rows={Math.max(8, (active.content.match(/\n/g)?.length ?? 0) + 3)}
            />

            {/* File error */}
            {fileErr && (
              <div style={{ margin: "10px 0", fontSize: "12px", color: "#e05555", background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.2)", borderRadius: "6px", padding: "8px 12px" }}>
                ⚠ {fileErr}
              </div>
            )}

            {/* Attachments */}
            {active.files?.length > 0 && (
              <div style={{ marginTop: "24px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
                <div style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>
                  Attachments ({active.files.length})
                </div>

                {/* Image grid */}
                {active.files.filter((f) => f.type.startsWith("image/")).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                    {active.files.filter((f) => f.type.startsWith("image/")).map((f) => (
                      <div key={f.id} style={{ position: "relative", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--border)" }}>
                        <img src={f.data} alt={f.name}
                          style={{ width: "120px", height: "90px", objectFit: "cover", display: "block", cursor: "pointer" }}
                          onClick={() => downloadFile(f)}
                          title={`${f.name} (${formatSize(f.size)}) — click to download`}
                        />
                        <button onClick={() => removeFile(f.id)}
                          style={{ position: "absolute", top: "4px", right: "4px", background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Non-image files */}
                {active.files.filter((f) => !f.type.startsWith("image/")).map((f) => (
                  <div key={f.id}
                    style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "6px", marginBottom: "6px" }}
                  >
                    <span style={{ fontSize: "18px" }}>
                      {f.type.includes("pdf") ? "📄" : f.type.includes("word") || f.name.endsWith(".docx") ? "📝" : f.type.includes("sheet") || f.name.endsWith(".xlsx") ? "📊" : "📁"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{formatSize(f.size)}</div>
                    </div>
                    <button onClick={() => downloadFile(f)}
                      style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--amber)"; (e.currentTarget as HTMLElement).style.color = "var(--amber)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                    >↓ Download</button>
                    <button onClick={() => removeFile(f.id)}
                      style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "13px", cursor: "pointer", padding: "2px 4px" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#e05555"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-dim)"; }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
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
