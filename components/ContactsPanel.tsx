"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ContactLog, LeadStatus, PipelineEntry } from "@/types";
import {
  getContacts,
  addContact,
  updateContact,
  deleteContact,
  getOverdueFollowUps,
  googleCalendarLink,
  onContactsChanged,
} from "@/lib/contacts";
import { getPipelineData, setLeadStatus } from "@/lib/pipeline";

const PIPELINE_META: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  new:       { label: "新线索", color: "var(--text-dim)",    bg: "transparent" },
  contacted: { label: "已联系", color: "var(--amber)",       bg: "rgba(212,160,60,0.08)" },
  following: { label: "跟进中", color: "var(--cyan)",        bg: "rgba(0,212,168,0.06)" },
  won:       { label: "成交",   color: "#7ab86a",            bg: "rgba(90,138,74,0.08)" },
  lost:      { label: "放弃",   color: "#c07070",            bg: "rgba(180,60,60,0.08)" },
};

function exportContactsCSV(contacts: ContactLog[]) {
  const header = "Company,Address,Phone,Method,Contacted At,Note,Follow-up Date,Follow-up Done";
  const rows = contacts.map((c) => [
    `"${c.buildingName.replace(/"/g, '""')}"`,
    `"${(c.buildingAddress ?? "").replace(/"/g, '""')}"`,
    `"${c.buildingPhone ?? ""}"`,
    c.method,
    c.contactedAt,
    `"${(c.note ?? "").replace(/"/g, '""')}"`,
    c.followUpAt ?? "",
    c.followUpDone ? "Yes" : "No",
  ].join(","));
  const blob = new Blob(["\uFEFF" + [header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `urbscan-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseContactsCSV(text: string): number {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return 0;
  // Skip header row
  const dataRows = lines.slice(1);
  let imported = 0;
  for (const line of dataRows) {
    // Simple CSV parse (handles quoted fields with commas inside)
    const fields: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        fields.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    const [company, address, phone, method, contactedAt, note, followUpAt, followUpDone] = fields;
    if (!company?.trim()) continue;
    const validMethods = ["whatsapp", "call", "email", "visit", "other"];
    addContact({
      buildingId: `import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      buildingName: company.trim(),
      buildingAddress: address?.trim() || undefined,
      buildingPhone: phone?.trim() || undefined,
      method: (validMethods.includes(method?.trim()) ? method.trim() : "other") as ContactLog["method"],
      note: note?.trim() ?? "",
      contactedAt: contactedAt?.trim() || new Date().toISOString(),
      followUpAt: followUpAt?.trim() || undefined,
      followUpDone: followUpDone?.trim()?.toLowerCase() === "yes",
    });
    imported++;
  }
  return imported;
}

const METHOD_META: Record<ContactLog["method"], { icon: string; label: string; color: string }> = {
  whatsapp: { icon: "💬", label: "WhatsApp", color: "#25d366" },
  call:     { icon: "📞", label: "Call",      color: "var(--amber)" },
  email:    { icon: "✉",  label: "Email",     color: "var(--cyan)" },
  visit:    { icon: "🏢", label: "Visit",     color: "var(--green-bright)" },
  other:    { icon: "◈",  label: "Other",     color: "var(--text-secondary)" },
};

type FilterMode = "all" | LeadStatus;
type SortCol = "name" | "date" | "followup" | "method";

interface EditForm {
  method: ContactLog["method"];
  note: string;
  followUpAt: string;
  followUpDone: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr).getTime() - today.getTime()) / 86400000);
}

function FollowUpBadge({ dateStr, done }: { dateStr: string; done: boolean }) {
  if (done) return (
    <span style={{ fontSize: "12px", color: "var(--green-bright)", background: "rgba(90,138,74,0.12)", borderRadius: "4px", padding: "2px 8px", whiteSpace: "nowrap" }}>
      ✓ Done
    </span>
  );
  const days = daysUntil(dateStr);
  const isOverdue = days < 0;
  const isToday = days === 0;
  const color = isOverdue ? "#e05555" : isToday ? "var(--amber)" : "var(--text-secondary)";
  const bg = isOverdue ? "rgba(224,85,85,0.1)" : isToday ? "var(--amber-glow)" : "rgba(0,0,0,0.04)";
  const label = isOverdue ? `${Math.abs(days)}d overdue` : isToday ? "Today" : `in ${days}d`;
  return (
    <span style={{ fontSize: "12px", color, background: bg, borderRadius: "4px", padding: "2px 8px", whiteSpace: "nowrap" }}>
      🔔 {label}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, padding: "14px 18px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", minWidth: 0 }}>
      <div style={{ fontSize: "22px", fontWeight: 700, color, marginBottom: "2px" }}>{value}</div>
      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  padding: "7px 10px",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "var(--font-ui)",
};

export default function ContactsPanel() {
  const [contacts, setContacts] = useState<ContactLog[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | "unsupported">("default");
  const [pipeline, setPipeline] = useState<Record<string, PipelineEntry>>({});
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const count = parseContactsCSV(text);
      setImportMsg(`已导入 ${count} 条联系记录`);
      setTimeout(() => setImportMsg(null), 3000);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  const reload = useCallback(() => {
    setContacts(getContacts());
    setPipeline(getPipelineData());
  }, []);

  useEffect(() => {
    reload();
    if (!("Notification" in window)) setNotifStatus("unsupported");
    else setNotifStatus(Notification.permission);
    return onContactsChanged(reload);
  }, [reload]);

  function changeStatus(buildingId: string, status: LeadStatus) {
    setLeadStatus(buildingId, status);
    setPipeline(getPipelineData());
  }

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
    setNotifStatus(await Notification.requestPermission());
  }

  function openRow(c: ContactLog) {
    if (expandedId === c.id) {
      setExpandedId(null);
      setEditForm(null);
    } else {
      setExpandedId(c.id);
      setEditForm({
        method: c.method,
        note: c.note || "",
        followUpAt: c.followUpAt || "",
        followUpDone: c.followUpDone,
      });
    }
  }

  function saveEdit(id: string) {
    if (!editForm) return;
    updateContact(id, {
      method: editForm.method,
      note: editForm.note,
      followUpAt: editForm.followUpAt || undefined,
      followUpDone: editForm.followUpAt ? editForm.followUpDone : false,
    });
    setExpandedId(null);
    setEditForm(null);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this contact log?")) return;
    deleteContact(id);
    if (expandedId === id) { setExpandedId(null); setEditForm(null); }
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortAsc((v) => !v);
    else { setSortCol(col); setSortAsc(true); }
  }

  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const byStatus = (s: LeadStatus) => contacts.filter((c) => (pipeline[c.buildingId]?.status ?? "new") === s).length;
    return {
      total:     contacts.length,
      new:       byStatus("new"),
      contacted: byStatus("contacted"),
      following: byStatus("following"),
      won:       byStatus("won"),
      lost:      byStatus("lost"),
      overdue:   contacts.filter((c) => !c.followUpDone && c.followUpAt && c.followUpAt < today).length,
    };
  }, [contacts, pipeline, today]);

  const filtered = useMemo(() => {
    let list = filter === "all"
      ? contacts
      : contacts.filter((c) => (pipeline[c.buildingId]?.status ?? "new") === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.buildingName.toLowerCase().includes(q) ||
        c.buildingAddress?.toLowerCase().includes(q) ||
        c.note?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "name")    cmp = a.buildingName.localeCompare(b.buildingName);
      if (sortCol === "date")    cmp = a.contactedAt.localeCompare(b.contactedAt);
      if (sortCol === "followup") cmp = (a.followUpAt ?? "").localeCompare(b.followUpAt ?? "");
      if (sortCol === "method")  cmp = a.method.localeCompare(b.method);
      return sortAsc ? cmp : -cmp;
    });
  }, [contacts, pipeline, filter, search, sortCol, sortAsc, today]);

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span style={{ opacity: 0.3, marginLeft: "4px" }}>↕</span>;
    return <span style={{ marginLeft: "4px", color: "var(--amber)" }}>{sortAsc ? "↑" : "↓"}</span>;
  }

  const thStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "11px",
    color: "var(--text-secondary)",
    fontWeight: 600,
    textAlign: "left",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
    background: "var(--bg-elevated)",
  };

  return (
    <div style={{ animation: "fadeSlideIn 0.3s ease" }}>

      {/* Notification banner */}
      {notifStatus === "default" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", border: "1px solid var(--amber-dim)", borderRadius: "8px", background: "var(--amber-glow)", marginBottom: "20px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>🔔 Enable browser notifications to get follow-up reminders</span>
          <button onClick={requestNotifications}
            style={{ fontSize: "12px", color: "var(--amber)", background: "var(--amber-glow)", border: "1px solid var(--amber)", borderRadius: "6px", padding: "4px 14px", cursor: "pointer" }}
          >Enable</button>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <StatCard label="总计"   value={stats.total}     color="var(--amber)" />
        <StatCard label="跟进中" value={stats.following} color="var(--cyan)" />
        <StatCard label="成交"   value={stats.won}       color="#7ab86a" />
        <StatCard label="逾期"   value={stats.overdue}   color={stats.overdue > 0 ? "#e05555" : "var(--text-dim)"} />
      </div>

      {/* Pipeline status tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
          {([
            { mode: "all",       label: `全部 (${stats.total})`,          color: "var(--amber)",  bg: "var(--amber-glow)" },
            { mode: "new",       label: `新线索 (${stats.new})`,          color: "var(--text-dim)", bg: "rgba(255,255,255,0.04)" },
            { mode: "contacted", label: `已联系 (${stats.contacted})`,    color: "var(--amber)",  bg: "rgba(212,160,60,0.08)" },
            { mode: "following", label: `跟进中 (${stats.following})`,    color: "var(--cyan)",   bg: "rgba(0,212,168,0.06)" },
            { mode: "won",       label: `成交 (${stats.won})`,            color: "#7ab86a",       bg: "rgba(90,138,74,0.08)" },
            { mode: "lost",      label: `放弃 (${stats.lost})`,           color: "#c07070",       bg: "rgba(180,60,60,0.08)" },
          ] as { mode: FilterMode; label: string; color: string; bg: string }[]).map(({ mode, label, color, bg }) => {
            const isActive = filter === mode;
            return (
              <button key={mode} onClick={() => setFilter(mode)}
                style={{ fontSize: "12px", padding: "5px 14px", borderRadius: "6px", border: `1px solid ${isActive ? color : "var(--border)"}`, background: isActive ? bg : "transparent", color: isActive ? color : "var(--text-secondary)", cursor: "pointer", transition: "all 0.15s", fontWeight: isActive ? 600 : 400 }}
              >{label}</button>
            );
          })}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, address, notes..."
          style={{ ...inputStyle, flex: 1, minWidth: "180px", padding: "6px 12px" }}
        />
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
          <button onClick={() => exportContactsCSV(filtered)}
            title="导出当前筛选结果为 CSV"
            style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--amber)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--amber)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
          >↓ 导出 CSV</button>
          <button onClick={() => importRef.current?.click()}
            title="从 CSV 导入联系记录"
            style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--cyan)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--cyan)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
          >↑ 导入 CSV</button>
          <input ref={importRef} type="file" accept=".csv,text/csv" onChange={handleImport} style={{ display: "none" }} />
          {importMsg && <span style={{ fontSize: "12px", color: "var(--green-bright)", animation: "fadeSlideIn 0.2s ease" }}>{importMsg}</span>}
        </div>
      </div>

      {/* Master list table */}
      {filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "260px", gap: "12px", border: "1px dashed var(--border)", borderRadius: "8px" }}>
          <div style={{ fontSize: "32px", color: "var(--text-dim)" }}>◈</div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            {search ? `No results for "${search}"` : filter === "all" ? "No contacts logged yet" : `No ${filter} entries`}
          </div>
          {filter === "all" && !search && (
            <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>Expand a lead and click "Log Contact" to get started</div>
          )}
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "32px", textAlign: "center", cursor: "default" }}>#</th>
                <th style={{ ...thStyle }} onClick={() => toggleSort("name")}>Company <SortIcon col="name" /></th>
                <th style={{ ...thStyle }} onClick={() => toggleSort("method")}>Method <SortIcon col="method" /></th>
                <th style={{ ...thStyle }} onClick={() => toggleSort("date")}>Contacted <SortIcon col="date" /></th>
                <th style={{ ...thStyle, cursor: "default" }}>Notes</th>
                <th style={{ ...thStyle }} onClick={() => toggleSort("followup")}>Follow-up <SortIcon col="followup" /></th>
                <th style={{ ...thStyle, width: "60px", cursor: "default" }}>Del</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const meta = METHOD_META[c.method];
                const isExpanded = expandedId === c.id;
                const isOverdue = !c.followUpDone && c.followUpAt && c.followUpAt < today;
                const leadStatus: LeadStatus = pipeline[c.buildingId]?.status ?? "new";
                const pMeta = PIPELINE_META[leadStatus];

                return (
                  <React.Fragment key={c.id}>
                    <tr
                      onClick={() => openRow(c)}
                      style={{
                        cursor: "pointer",
                        borderTop: i > 0 ? "1px solid var(--border)" : "none",
                        background: isExpanded ? "var(--bg-elevated)" : "var(--bg-card)",
                        transition: "background 0.15s",
                        borderLeft: `3px solid ${isOverdue ? "#e05555" : meta.color}`,
                      }}
                      onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "var(--bg-card)"; }}
                    >
                      <td style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: "var(--text-dim)", fontWeight: 600 }}>
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <td style={{ padding: "12px 14px", maxWidth: "200px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "1px" }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.buildingName}</div>
                          {leadStatus !== "new" && (
                            <span style={{ fontSize: "10px", color: pMeta.color, background: pMeta.bg, border: `1px solid ${pMeta.color}44`, borderRadius: "3px", padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0 }}>{pMeta.label}</span>
                          )}
                        </div>
                        {c.buildingAddress && (
                          <div style={{ fontSize: "11px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }}>{c.buildingAddress}</div>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: "13px", color: meta.color }}>{meta.icon} {meta.label}</span>
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{formatDateTime(c.contactedAt)}</span>
                      </td>
                      <td style={{ padding: "12px 14px", maxWidth: "180px" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {c.note || <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>—</span>}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {c.followUpAt
                          ? <FollowUpBadge dateStr={c.followUpAt} done={c.followUpDone} />
                          : <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleDelete(c.id)} title="Delete"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: "13px", padding: "0", opacity: 0.5, transition: "all 0.15s" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; (e.currentTarget as HTMLElement).style.color = "#e05555"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.5"; (e.currentTarget as HTMLElement).style.color = "var(--text-dim)"; }}
                        >✕</button>
                      </td>
                    </tr>

                    {/* Inline edit form */}
                    {isExpanded && editForm && (
                      <tr key={`${c.id}-edit`} style={{ background: "var(--bg-elevated)", borderTop: "1px solid var(--border)" }}>
                        <td style={{ borderLeft: `3px solid ${meta.color}` }} />
                        <td colSpan={6} style={{ padding: "16px 18px" }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>

                            {/* Lead Status */}
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "6px", fontWeight: 600 }}>LEAD STATUS</label>
                              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                                {(Object.keys(PIPELINE_META) as LeadStatus[]).map((s) => {
                                  const pm = PIPELINE_META[s];
                                  const isActive = leadStatus === s;
                                  return (
                                    <button key={s}
                                      onClick={(e) => { e.stopPropagation(); changeStatus(c.buildingId, s); }}
                                      style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "4px", border: `1px solid ${isActive ? pm.color : "var(--border)"}`, background: isActive ? pm.bg : "transparent", color: isActive ? pm.color : "var(--text-secondary)", cursor: "pointer", transition: "all 0.15s", fontWeight: isActive ? 600 : 400 }}
                                    >{pm.label}</button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Method */}
                            <div>
                              <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "5px", fontWeight: 600 }}>CONTACT METHOD</label>
                              <select
                                value={editForm.method}
                                onChange={(e) => setEditForm({ ...editForm, method: e.target.value as ContactLog["method"] })}
                                style={{ ...inputStyle }}
                              >
                                {(Object.keys(METHOD_META) as ContactLog["method"][]).map((m) => (
                                  <option key={m} value={m}>{METHOD_META[m].icon} {METHOD_META[m].label}</option>
                                ))}
                              </select>
                            </div>

                            {/* Follow-up date */}
                            <div>
                              <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "5px", fontWeight: 600 }}>FOLLOW-UP DATE</label>
                              <input
                                type="date"
                                value={editForm.followUpAt}
                                onChange={(e) => setEditForm({ ...editForm, followUpAt: e.target.value, followUpDone: false })}
                                style={{ ...inputStyle }}
                              />
                            </div>

                            {/* Notes — full width */}
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "5px", fontWeight: 600 }}>NOTES</label>
                              <textarea
                                value={editForm.note}
                                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                                rows={3}
                                placeholder="Add notes about this contact..."
                                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
                              />
                            </div>

                            {/* Mark done checkbox (only if followUpAt is set) */}
                            {editForm.followUpAt && (
                              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "8px" }}>
                                <input
                                  type="checkbox"
                                  id={`done-${c.id}`}
                                  checked={editForm.followUpDone}
                                  onChange={(e) => setEditForm({ ...editForm, followUpDone: e.target.checked })}
                                  style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--green-bright)" }}
                                />
                                <label htmlFor={`done-${c.id}`} style={{ fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer" }}>
                                  Mark follow-up as done
                                </label>
                              </div>
                            )}
                          </div>

                          {/* Buttons */}
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <button onClick={() => saveEdit(c.id)}
                              style={{ fontSize: "13px", padding: "6px 18px", borderRadius: "6px", border: "none", background: "var(--amber)", color: "var(--bg)", fontWeight: 600, cursor: "pointer" }}
                            >Save</button>
                            <button onClick={() => { setExpandedId(null); setEditForm(null); }}
                              style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
                            >Cancel</button>
                            {editForm.followUpAt && !editForm.followUpDone && (
                              <a href={googleCalendarLink({ ...c, ...editForm, followUpAt: editForm.followUpAt || undefined })} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: "12px", color: "var(--text-secondary)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "5px 12px" }}
                              >📅 Calendar</a>
                            )}
                            {c.buildingPhone && (
                              <span style={{ marginLeft: "auto", fontSize: "13px", color: "var(--text-secondary)" }}>
                                ☎ <a href={`tel:${c.buildingPhone}`} style={{ color: "var(--amber)", textDecoration: "none" }}>{c.buildingPhone}</a>
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
