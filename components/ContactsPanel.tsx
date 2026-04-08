"use client";

import { useState, useEffect, useCallback } from "react";
import { ContactLog } from "@/types";
import { getContacts, updateContact, deleteContact, getOverdueFollowUps, googleCalendarLink } from "@/lib/contacts";

const METHOD_META: Record<ContactLog["method"], { icon: string; label: string; color: string }> = {
  whatsapp: { icon: "💬", label: "WhatsApp", color: "#25d366" },
  call:     { icon: "📞", label: "Call",      color: "var(--amber)" },
  email:    { icon: "✉",  label: "Email",     color: "#6090c0" },
  visit:    { icon: "🏢", label: "Visit",     color: "var(--green-bright)" },
  other:    { icon: "◈",  label: "Other",     color: "var(--text-secondary)" },
};

type FilterMode = "all" | "overdue" | "upcoming" | "done";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function FollowUpBadge({ dateStr, done }: { dateStr: string; done: boolean }) {
  if (done) return <span style={{ fontSize: "10px", color: "var(--green-bright)", border: "1px solid rgba(90,138,74,0.3)", borderRadius: "2px", padding: "1px 6px" }}>✓ Done</span>;
  const days = daysUntil(dateStr);
  const color = days < 0 ? "#c07070" : days === 0 ? "var(--amber)" : "var(--text-secondary)";
  const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `in ${days}d`;
  return <span style={{ fontSize: "10px", color, border: `1px solid ${color}40`, borderRadius: "2px", padding: "1px 6px", letterSpacing: "0.04em" }}>🔔 {label}</span>;
}

export default function ContactsPanel() {
  const [contacts, setContacts] = useState<ContactLog[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | "unsupported">("default");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(() => setContacts(getContacts()), []);

  useEffect(() => {
    reload();
    if (!("Notification" in window)) {
      setNotifStatus("unsupported");
    } else {
      setNotifStatus(Notification.permission);
    }
  }, [reload]);

  // Browser notification for overdue on mount
  useEffect(() => {
    if (typeof window === "undefined" || Notification.permission !== "granted") return;
    const overdue = getOverdueFollowUps();
    if (overdue.length === 0) return;
    new Notification("URBSCAN — Follow-up Reminder", {
      body: `You have ${overdue.length} overdue follow-up${overdue.length > 1 ? "s" : ""}:\n${overdue.slice(0, 3).map((c) => `• ${c.buildingName}`).join("\n")}`,
      icon: "/favicon.ico",
    });
  }, []);

  async function requestNotifications() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotifStatus(permission);
  }

  function handleMarkDone(id: string, done: boolean) {
    updateContact(id, { followUpDone: done });
    reload();
  }

  function handleDelete(id: string) {
    deleteContact(id);
    reload();
  }

  const today = new Date().toISOString().slice(0, 10);

  const filtered = contacts.filter((c) => {
    if (filter === "overdue") return !c.followUpDone && c.followUpAt && c.followUpAt < today;
    if (filter === "upcoming") return !c.followUpDone && c.followUpAt && c.followUpAt >= today;
    if (filter === "done") return c.followUpDone;
    return true;
  });

  const overdueCount = contacts.filter((c) => !c.followUpDone && c.followUpAt && c.followUpAt < today).length;
  const upcomingCount = contacts.filter((c) => !c.followUpDone && c.followUpAt && c.followUpAt >= today).length;

  return (
    <div style={{ animation: "fadeSlideIn 0.3s ease" }}>

      {/* Notification banner */}
      {notifStatus === "default" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", border: "1px solid rgba(212,160,60,0.3)", borderRadius: "3px", background: "rgba(212,160,60,0.05)", marginBottom: "16px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", letterSpacing: "0.04em" }}>🔔 Enable browser notifications to get follow-up reminders</span>
          <button onClick={requestNotifications}
            style={{ fontSize: "11px", color: "var(--amber)", background: "rgba(212,160,60,0.1)", border: "1px solid var(--amber)", borderRadius: "3px", padding: "4px 12px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}
          >Enable</button>
        </div>
      )}

      {/* Overdue alert */}
      {overdueCount > 0 && filter !== "done" && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", border: "1px solid rgba(192,112,112,0.4)", borderRadius: "3px", background: "rgba(180,60,60,0.06)", marginBottom: "14px", cursor: "pointer" }}
          onClick={() => setFilter("overdue")}
        >
          <span style={{ fontSize: "18px" }}>⚠</span>
          <span style={{ fontSize: "13px", color: "#c07070", letterSpacing: "0.04em" }}>
            <strong>{overdueCount}</strong> overdue follow-up{overdueCount > 1 ? "s" : ""} — click to view
          </span>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
        {([
          { mode: "all",      label: `All (${contacts.length})` },
          { mode: "overdue",  label: `Overdue (${overdueCount})`, color: overdueCount > 0 ? "#c07070" : undefined },
          { mode: "upcoming", label: `Upcoming (${upcomingCount})` },
          { mode: "done",     label: "Done" },
        ] as { mode: FilterMode; label: string; color?: string }[]).map(({ mode, label, color }) => (
          <button key={mode} onClick={() => setFilter(mode)}
            style={{ fontSize: "11px", padding: "4px 12px", borderRadius: "3px", border: `1px solid ${filter === mode ? (color ?? "var(--amber)") : "var(--border)"}`, background: filter === mode ? `${(color ?? "var(--amber)")}1a` : "transparent", color: filter === mode ? (color ?? "var(--amber)") : "var(--text-secondary)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", transition: "all 0.15s" }}
          >{label}</button>
        ))}
      </div>

      {/* Contact list */}
      {filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "280px", gap: "12px" }}>
          <div style={{ fontSize: "36px", color: "var(--text-dim)" }}>◈</div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {filter === "all" ? "No contacts logged yet" : `No ${filter} follow-ups`}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
            {filter === "all" && "Expand a lead and click \"Log Contact\" to get started"}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {filtered.map((c, i) => {
            const meta = METHOD_META[c.method];
            const isExpanded = expandedId === c.id;
            const isOverdue = !c.followUpDone && c.followUpAt && c.followUpAt < today;

            return (
              <div key={c.id}
                style={{ border: `1px solid ${isOverdue ? "rgba(192,112,112,0.3)" : "var(--border)"}`, borderRadius: "3px", background: isOverdue ? "rgba(180,60,60,0.03)" : "var(--bg-card)", animation: `rowReveal 0.25s ease ${Math.min(i * 0.025, 0.3)}s both`, borderLeft: `3px solid ${isOverdue ? "#c07070" : meta.color}` }}
              >
                {/* Row */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", cursor: "pointer" }}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                      <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.buildingName}</span>
                      <span style={{ fontSize: "10px", color: meta.color, flexShrink: 0, letterSpacing: "0.06em" }}>{meta.label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{formatDateTime(c.contactedAt)}</span>
                      {c.note && <span style={{ fontSize: "11px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>{c.note}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    {c.followUpAt && <FollowUpBadge dateStr={c.followUpAt} done={c.followUpDone} />}
                    {c.followUpAt && !c.followUpDone && (
                      <a href={googleCalendarLink(c)} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Add to Google Calendar"
                        style={{ fontSize: "14px", textDecoration: "none", opacity: 0.7, transition: "opacity 0.15s" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.opacity = "1")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.opacity = "0.7")}
                      >📅</a>
                    )}
                    <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--border)", animation: "fadeSlideIn 0.15s ease" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.buildingAddress && (
                      <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "8px" }}>📍 {c.buildingAddress}</div>
                    )}
                    {c.buildingPhone && (
                      <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "8px" }}>
                        ☎ <a href={`tel:${c.buildingPhone}`} style={{ color: "var(--amber)", textDecoration: "none" }}>{c.buildingPhone}</a>
                      </div>
                    )}
                    {c.note && (
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", background: "rgba(212,160,60,0.03)", border: "1px solid var(--border)", borderRadius: "3px", padding: "8px 10px", lineHeight: 1.6, marginBottom: "10px", whiteSpace: "pre-wrap" }}>{c.note}</div>
                    )}
                    {c.followUpAt && (
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                          Follow-up: <strong style={{ color: "var(--text-primary)" }}>{formatDate(c.followUpAt)}</strong>
                        </span>
                        {!c.followUpDone && (
                          <a href={googleCalendarLink(c)} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: "11px", color: "#6090c0", textDecoration: "none", border: "1px solid rgba(96,144,192,0.35)", borderRadius: "3px", padding: "2px 10px", letterSpacing: "0.05em" }}
                          >📅 Add to Google Calendar</a>
                        )}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {c.followUpAt && !c.followUpDone && (
                        <button onClick={() => handleMarkDone(c.id, true)}
                          style={{ fontSize: "11px", padding: "4px 12px", border: "1px solid rgba(90,138,74,0.4)", borderRadius: "3px", background: "rgba(90,138,74,0.08)", color: "var(--green-bright)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
                        >✓ Mark Follow-up Done</button>
                      )}
                      {c.followUpDone && (
                        <button onClick={() => handleMarkDone(c.id, false)}
                          style={{ fontSize: "11px", padding: "4px 12px", border: "1px solid var(--border)", borderRadius: "3px", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
                        >↩ Reopen</button>
                      )}
                      <button onClick={() => handleDelete(c.id)}
                        style={{ fontSize: "11px", padding: "4px 12px", border: "1px solid rgba(180,60,60,0.3)", borderRadius: "3px", background: "transparent", color: "#c07070", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
                      >✕ Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
