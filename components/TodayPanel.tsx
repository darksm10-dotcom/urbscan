"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Task, ContactLog } from "@/types";
import { getTasks, addTask, toggleTask, deleteTask, renameTask, onTasksChanged } from "@/lib/tasks";
import { getOverdueFollowUps, updateContact, onContactsChanged } from "@/lib/contacts";

const today = () => new Date().toISOString().slice(0, 10);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

interface TaskRowProps {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}

interface FollowUpCardProps {
  contact: ContactLog;
  onGoToContacts: () => void;
  onMarkDone: () => void;
  onReschedule: (date: string) => void;
  onAddNote: (note: string) => void;
  onFollowUpEmail?: (contact: ContactLog) => void;
  isGeneratingEmail?: boolean;
}

interface TodayPanelProps {
  onGoToContacts: () => void;
  onFollowUpEmail?: (contact: ContactLog) => void;
}

function TaskRow({ task, onToggle, onDelete, onRename }: TaskRowProps) {
  const todayStr = today();
  const isOverdue = task.date < todayStr && !task.done;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(task.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.title) onRename(trimmed);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "10px 12px",
      borderRadius: "8px",
      background: "var(--bg-elevated)",
      opacity: task.done ? 0.45 : 1,
      transition: "opacity 0.2s",
    }}>
      <input
        type="checkbox"
        checked={task.done}
        onChange={onToggle}
        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--amber)", flexShrink: 0 }}
      />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            fontSize: "14px",
            color: "var(--text-primary)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--amber)",
            outline: "none",
            fontFamily: "var(--font-ui)",
            padding: "0",
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          title="Click to edit"
          style={{
            flex: 1,
            fontSize: "14px",
            color: "var(--text-primary)",
            textDecoration: task.done ? "line-through" : "none",
            cursor: "text",
          }}
        >
          {task.title}
        </span>
      )}
      {task.date !== todayStr && (
        <span style={{
          fontSize: "11px",
          padding: "2px 7px",
          borderRadius: "4px",
          background: isOverdue ? "rgba(239,68,68,0.15)" : "var(--bg-card)",
          color: isOverdue ? "#ef4444" : "var(--text-dim)",
          fontWeight: 500,
          flexShrink: 0,
        }}>
          {task.date}
        </span>
      )}
      <button
        onClick={onDelete}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-dim)",
          cursor: "pointer",
          fontSize: "16px",
          lineHeight: 1,
          padding: "0 2px",
          flexShrink: 0,
          opacity: 0.6,
        }}
        title="删除"
      >
        ×
      </button>
    </div>
  );
}

function FollowUpCard({ contact, onGoToContacts, onMarkDone, onReschedule, onAddNote, onFollowUpEmail, isGeneratingEmail }: FollowUpCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const methodLabel: Record<ContactLog["method"], string> = {
    whatsapp: "WhatsApp", call: "通话", email: "邮件", visit: "拜访", other: "其他",
  };
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const in3dStr = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const in7dStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  return (
    <div style={{ borderRadius: "8px", background: "var(--bg-elevated)", borderLeft: "3px solid var(--amber)", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ minWidth: 0, cursor: "pointer", flex: 1 }} onClick={() => setExpanded(!expanded)}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {contact.buildingName}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {methodLabel[contact.method]}
            {contact.note ? ` · ${contact.note.slice(0, 60)}${contact.note.length > 60 ? "…" : ""}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          {onFollowUpEmail && (
            <button
              onClick={() => onFollowUpEmail(contact)}
              disabled={isGeneratingEmail}
              style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "1px solid rgba(96,165,250,0.4)", background: isGeneratingEmail ? "rgba(167,139,250,0.1)" : "rgba(96,165,250,0.08)", color: isGeneratingEmail ? "#a78bfa" : "var(--cyan)", cursor: isGeneratingEmail ? "not-allowed" : "pointer", fontFamily: "var(--font-ui)", fontWeight: 600 }}
            >
              {isGeneratingEmail ? "生成中…" : "✦ Email"}
            </button>
          )}
          <button onClick={onMarkDone} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "1px solid rgba(122,184,106,0.5)", background: "rgba(122,184,106,0.1)", color: "#7ab86a", cursor: "pointer", fontFamily: "var(--font-ui)" }}>✓ 完成</button>
          <button onClick={() => setExpanded(!expanded)} style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-ui)" }}>{expanded ? "▲" : "▼"}</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid var(--border)" }}>
          {/* Quick reschedule */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "6px", marginTop: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>改期</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[["明天", tomorrowStr], ["3天后", in3dStr], ["1周后", in7dStr]].map(([label, date]) => (
                <button key={date} onClick={() => onReschedule(date)} style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>{label}</button>
              ))}
              <input type="date" style={{ fontSize: "12px", padding: "3px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer" }} onChange={(e) => { if (e.target.value) onReschedule(e.target.value); }} />
            </div>
          </div>
          {/* Add note */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>加备注</div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && noteInput.trim()) { onAddNote(noteInput.trim()); setNoteInput(""); } }}
                placeholder="输入备注，按 Enter 保存…"
                style={{ flex: 1, fontSize: "13px", padding: "5px 10px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", outline: "none", fontFamily: "var(--font-ui)" }}
              />
              <button onClick={() => { if (noteInput.trim()) { onAddNote(noteInput.trim()); setNoteInput(""); } }} style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "4px", border: "none", background: "var(--amber)", color: "#000", cursor: "pointer", fontWeight: 600 }}>保存</button>
            </div>
          </div>
          <button onClick={onGoToContacts} style={{ fontSize: "12px", padding: "4px 0", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", textAlign: "left", textDecoration: "underline" }}>→ 在联系人页面查看</button>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-dim)", marginBottom: "5px" }}>
        <span>今日进度</span>
        <span>{done} / {total} 完成</span>
      </div>
      <div style={{ height: "4px", borderRadius: "2px", background: "var(--bg-elevated)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: "2px",
          background: pct === 100 ? "#7ab86a" : "var(--amber)",
          transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

export default function TodayPanel({ onGoToContacts, onFollowUpEmail }: TodayPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [followUps, setFollowUps] = useState<ContactLog[]>([]);
  const [generatingEmailIds, setGeneratingEmailIds] = useState<Set<string>>(new Set());
  const generatingEmailRef = useRef<Set<string>>(new Set());

  async function handleFollowUpEmailLocal(contact: ContactLog) {
    if (!onFollowUpEmail || generatingEmailRef.current.has(contact.id)) return;
    generatingEmailRef.current.add(contact.id);
    setGeneratingEmailIds((prev) => new Set(prev).add(contact.id));
    try {
      await onFollowUpEmail(contact);
    } finally {
      generatingEmailRef.current.delete(contact.id);
      setGeneratingEmailIds((prev) => { const s = new Set(prev); s.delete(contact.id); return s; });
    }
  }
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => today());

  const refreshTasks = useCallback(() => {
    const todayStr = today();
    const all = getTasks();
    setTasks(all.filter((t) => t.date <= todayStr && (!t.done || t.date === todayStr)));
  }, []);

  const refreshFollowUps = useCallback(() => {
    setFollowUps(getOverdueFollowUps());
  }, []);

  useEffect(() => {
    refreshTasks();
    refreshFollowUps();
    const unsubTasks = onTasksChanged(refreshTasks);
    const unsubContacts = onContactsChanged(refreshFollowUps);
    return () => { unsubTasks(); unsubContacts(); };
  }, [refreshTasks, refreshFollowUps]);

  useEffect(() => {
    function scheduleRefresh() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const timer = setTimeout(() => {
        refreshTasks();
        refreshFollowUps();
        scheduleRefresh();
      }, midnight.getTime() - now.getTime());
      return timer;
    }
    const timer = scheduleRefresh();
    return () => clearTimeout(timer);
  }, [refreshTasks, refreshFollowUps]);

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({ title: trimmed, date, done: false });
    setTitle("");
    setDate(today());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAdd();
  }

  function handleRename(id: string, newTitle: string) {
    renameTask(id, newTitle);
  }

  function handleMarkFollowUpDone(id: string) {
    updateContact(id, { followUpDone: true });
  }

  function handleReschedule(id: string, date: string) {
    updateContact(id, { followUpAt: date, followUpDone: false });
  }

  function handleAddNote(id: string, note: string) {
    const existing = followUps.find((c) => c.id === id);
    const combined = existing?.note ? `${existing.note}\n${note}` : note;
    updateContact(id, { note: combined });
  }

  const todayStr = today();
  const overdueTasks = tasks.filter((t) => t.date < todayStr && !t.done);
  const todayPending = tasks.filter((t) => t.date === todayStr && !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  const totalToday = todayPending.length + doneTasks.length;
  const allClear = overdueTasks.length === 0 && todayPending.length === 0 && followUps.length === 0;

  return (
    <div style={{
      flex: 1,
      padding: "32px 40px",
      overflowY: "auto",
      maxWidth: "720px",
      display: "flex",
      flexDirection: "column",
      gap: "28px",
    }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>
          {greeting()} 👋
        </div>
        <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          {new Date().toLocaleDateString("zh-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        <ProgressBar done={doneTasks.length} total={totalToday} />
      </div>

      {/* All clear state */}
      {allClear && tasks.length > 0 && (
        <div style={{
          padding: "24px",
          borderRadius: "12px",
          background: "rgba(122,184,106,0.08)",
          border: "1px solid rgba(122,184,106,0.25)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>🎉</div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#7ab86a" }}>今天全部搞定！</div>
          <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "4px" }}>休息一下，明天继续加油</div>
        </div>
      )}

      {/* My Tasks section */}
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>
          我的任务
        </div>

        {/* Add task row */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="添加任务…"
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-ui)",
              outline: "none",
            }}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              padding: "9px 10px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontFamily: "var(--font-ui)",
              outline: "none",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!title.trim()}
            style={{
              padding: "9px 16px",
              borderRadius: "8px",
              border: "none",
              background: title.trim() ? "var(--amber)" : "var(--bg-elevated)",
              color: title.trim() ? "#000" : "var(--text-dim)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: title.trim() ? "pointer" : "default",
              fontFamily: "var(--font-ui)",
              transition: "all 0.15s",
            }}
          >
            添加
          </button>
        </div>

        {/* Task groups */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {overdueTasks.length === 0 && todayPending.length === 0 && doneTasks.length === 0 && (
            <div style={{ fontSize: "14px", color: "var(--text-dim)", padding: "12px 0" }}>
              今天没有任务 — 在上方添加一个
            </div>
          )}

          {/* Overdue group */}
          {overdueTasks.length > 0 && (
            <>
              <div style={{ fontSize: "11px", color: "#ef4444", marginBottom: "4px", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
                逾期 · {overdueTasks.length}
              </div>
              {overdueTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask(task.id)}
                  onDelete={() => deleteTask(task.id)}
                  onRename={(t) => handleRename(task.id, t)}
                />
              ))}
              {todayPending.length > 0 && <div style={{ height: "4px" }} />}
            </>
          )}

          {/* Today pending group */}
          {todayPending.length > 0 && (
            <>
              {overdueTasks.length > 0 && (
                <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "4px", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
                  今天 · {todayPending.length}
                </div>
              )}
              {todayPending.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask(task.id)}
                  onDelete={() => deleteTask(task.id)}
                  onRename={(t) => handleRename(task.id, t)}
                />
              ))}
            </>
          )}

          {/* Done group */}
          {doneTasks.length > 0 && (
            <>
              <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "8px", marginBottom: "4px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                已完成 · {doneTasks.length}
              </div>
              {doneTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask(task.id)}
                  onDelete={() => deleteTask(task.id)}
                  onRename={(t) => handleRename(task.id, t)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Follow-ups section */}
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>
          待跟进 {followUps.length > 0 && <span style={{ color: "var(--amber)" }}>· {followUps.length}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {followUps.length === 0 ? (
            <div style={{ fontSize: "14px", color: "var(--text-dim)", padding: "4px 0" }}>
              今天没有待跟进
            </div>
          ) : (
            followUps.map((c) => (
              <FollowUpCard
                key={c.id}
                contact={c}
                onGoToContacts={onGoToContacts}
                onMarkDone={() => handleMarkFollowUpDone(c.id)}
                onReschedule={(date) => handleReschedule(c.id, date)}
                onAddNote={(note) => handleAddNote(c.id, note)}
                onFollowUpEmail={onFollowUpEmail ? handleFollowUpEmailLocal : undefined}
                isGeneratingEmail={generatingEmailIds.has(c.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
