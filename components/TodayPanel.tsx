"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Task } from "@/types";
import { getTasks, addTask, toggleTask, deleteTask, onTasksChanged } from "@/lib/tasks";
import { getOverdueFollowUps, onContactsChanged } from "@/lib/contacts";
import { ContactLog } from "@/types";

const today = () => new Date().toISOString().slice(0, 10);

interface TaskRowProps {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
}

interface FollowUpCardProps {
  contact: ContactLog;
  onGoToContacts: () => void;
}

interface TodayPanelProps {
  onGoToContacts: () => void;
}

function TaskRow({ task, onToggle, onDelete }: TaskRowProps) {
  const isOverdue = task.date < today() && !task.done;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "10px 12px",
      borderRadius: "8px",
      background: "var(--bg-elevated)",
      opacity: task.done ? 0.5 : 1,
    }}>
      <input
        type="checkbox"
        checked={task.done}
        onChange={onToggle}
        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--amber)", flexShrink: 0 }}
      />
      <span style={{
        flex: 1,
        fontSize: "14px",
        color: "var(--text-primary)",
        textDecoration: task.done ? "line-through" : "none",
      }}>
        {task.title}
      </span>
      {task.date !== today() && (
        <span style={{
          fontSize: "11px",
          padding: "2px 7px",
          borderRadius: "4px",
          background: isOverdue ? "rgba(239,68,68,0.15)" : "var(--bg-card)",
          color: isOverdue ? "#ef4444" : "var(--text-dim)",
          fontWeight: 500,
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
        }}
        title="Delete task"
      >
        ×
      </button>
    </div>
  );
}

function FollowUpCard({ contact, onGoToContacts }: FollowUpCardProps) {
  const methodLabel: Record<ContactLog["method"], string> = {
    whatsapp: "WhatsApp",
    call: "Call",
    email: "Email",
    visit: "Visit",
    other: "Other",
  };
  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: "8px",
      background: "var(--bg-elevated)",
      borderLeft: "3px solid var(--amber)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            {contact.buildingName}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {methodLabel[contact.method]}
            {contact.note ? ` · ${contact.note.slice(0, 60)}${contact.note.length > 60 ? "…" : ""}` : ""}
          </div>
        </div>
        <button
          onClick={onGoToContacts}
          style={{
            fontSize: "12px",
            padding: "4px 10px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            flexShrink: 0,
            fontFamily: "var(--font-ui)",
          }}
        >
          → Contacts
        </button>
      </div>
    </div>
  );
}

export default function TodayPanel({ onGoToContacts }: TodayPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [followUps, setFollowUps] = useState<ContactLog[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => today());

  const refreshTasks = useCallback(() => {
    const todayStr = today();
    const all = getTasks();
    // Show tasks due today or overdue (date <= today), including done tasks from today
    setTasks(all.filter((t) => t.date <= todayStr));
  }, []);

  const refreshFollowUps = useCallback(() => {
    setFollowUps(getOverdueFollowUps());
  }, []);

  useEffect(() => {
    refreshTasks();
    refreshFollowUps();
    const unsubTasks = onTasksChanged(refreshTasks);
    const unsubContacts = onContactsChanged(refreshFollowUps);
    return () => {
      unsubTasks();
      unsubContacts();
    };
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

  const pendingTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  return (
    <div style={{
      flex: 1,
      padding: "32px 40px",
      overflowY: "auto",
      maxWidth: "720px",
      display: "flex",
      flexDirection: "column",
      gap: "32px",
    }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
          Today
        </div>
        <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          {new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      {/* My Tasks section */}
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>
          My Tasks
        </div>

        {/* Add task row */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a task…"
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
            Add
          </button>
        </div>

        {/* Task list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {pendingTasks.length === 0 && doneTasks.length === 0 && (
            <div style={{ fontSize: "14px", color: "var(--text-dim)", padding: "12px 0" }}>
              Nothing on your list — add a task above
            </div>
          )}
          {pendingTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => toggleTask(task.id)}
              onDelete={() => deleteTask(task.id)}
            />
          ))}
          {doneTasks.length > 0 && (
            <>
              <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "8px", marginBottom: "4px", letterSpacing: "0.04em" }}>
                DONE
              </div>
              {doneTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask(task.id)}
                  onDelete={() => deleteTask(task.id)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Follow-ups section */}
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>
          Follow-ups Due Today
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {followUps.length === 0 ? (
            <div style={{ fontSize: "14px", color: "var(--text-dim)", padding: "4px 0" }}>
              No follow-ups due today
            </div>
          ) : (
            followUps.map((c) => (
              <FollowUpCard key={c.id} contact={c} onGoToContacts={onGoToContacts} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
