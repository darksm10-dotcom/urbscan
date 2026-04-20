"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { updateContact, addContact } from "@/lib/contacts";
import {
  getEmailDrafts,
  addEmailDraft,
  updateEmailDraft,
  markEmailSent,
  deleteEmailDraft,
  onEmailDraftsChanged,
} from "@/lib/email-drafts";
import { getEmailPrompt, saveEmailPrompt, DEFAULT_PROMPT } from "@/lib/email-settings";
import { getPipelineData } from "@/lib/pipeline";
import { STATUS_META } from "@/lib/constants";
import { EmailDraft } from "@/types";
import type { ComposeEmailPayload } from "./ResultsList";

interface EmailPanelProps {
  initialCompose?: ComposeEmailPayload | null;
  onComposeClear?: () => void;
  onGoToContacts?: () => void;
}

const STATUS = {
  queued: { label: "待邮箱", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  draft:  { label: "草稿",   color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  sent:   { label: "已发送", color: "#1DB954", bg: "rgba(29,185,84,0.12)" },
} as const;

export default function EmailPanel({ initialCompose, onComposeClear, onGoToContacts }: EmailPanelProps) {
  const [items, setItems] = useState<EmailDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followUpDays, setFollowUpDays] = useState(3);
  const [showPrompt, setShowPrompt] = useState(false);
  const [rolePrompt, setRolePrompt] = useState("");

  // Edit state for the right panel (draft mode)
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  // Queued state
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editCc, setEditCc] = useState<string[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const abortRef = useRef<boolean>(false);

  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentToast, setSentToast] = useState<{ name: string; email: string } | null>(null);
  const [pipeline, setPipeline] = useState<ReturnType<typeof getPipelineData>>({});

  const reload = useCallback(() => {
    setItems(getEmailDrafts());
    setPipeline(getPipelineData());
  }, []);

  useEffect(() => {
    reload();
    setRolePrompt(getEmailPrompt());
    return onEmailDraftsChanged(reload);
  }, [reload]);

  const loadIntoEditor = useCallback((d: EmailDraft) => {
    setEditEmail(d.recipientEmail);
    setEditName(d.recipientName);
    setEditCc(d.ccEmails ?? []);
    setEditSubject(d.subject);
    setEditBody(d.bodyText);
  }, []);

  // Handle incoming compose from Scan tab
  useEffect(() => {
    if (!initialCompose) return;
    onComposeClear?.();

    // Check for existing queued/draft for same building
    const existing = getEmailDrafts().find(
      (d) => d.contactId === initialCompose.buildingId && d.status !== "sent"
    );
    if (existing) {
      setSelectedId(existing.id);
      loadIntoEditor(existing);
      // Override CC with fresh scrape results from this compose action
      if (initialCompose.ccEmails && initialCompose.ccEmails.length > 0) {
        setEditCc(initialCompose.ccEmails);
        updateEmailDraft(existing.id, { ccEmails: initialCompose.ccEmails });
      }
      return;
    }

    const entry = addEmailDraft({
      contactId: initialCompose.buildingId,
      buildingName: initialCompose.buildingName,
      buildingAddress: initialCompose.buildingAddress,
      website: initialCompose.website,
      recipientEmail: initialCompose.recipientEmail,
      ccEmails: initialCompose.ccEmails,
      recipientName: "",
      subject: "",
      bodyText: "",
      bodyHtml: "",
      status: "queued",
    });
    setSelectedId(entry.id);
    setEditEmail(initialCompose.recipientEmail);
    setEditCc(initialCompose.ccEmails ?? []);
    setEditName("");
    setEditSubject("");
    setEditBody("");
  }, [initialCompose, loadIntoEditor]);

  function selectItem(d: EmailDraft) {
    setSelectedId(d.id);
    loadIntoEditor(d);
  }

  const selected = items.find((d) => d.id === selectedId) ?? null;

  async function handleGenerate() {
    if (!selected) return;
    const email = editEmail.trim();
    if (!email) return;

    setGenerating(true);
    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingName: selected.buildingName,
          buildingAddress: selected.buildingAddress,
          recipientName: editName,
          note: selected.bodyText || undefined,
          rolePrompt: rolePrompt || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Generation failed (${res.status})`);
      }
      const data = await res.json() as { subject: string; bodyText: string; bodyHtml: string };
      updateEmailDraft(selected.id, {
        recipientEmail: email,
        recipientName: editName,
        subject: data.subject,
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
        status: "draft",
      });
      setEditSubject(data.subject);
      setEditBody(data.bodyText);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleBatchGenerate() {
    const targets = items.filter((d) => d.status === "queued" && selectedIds.has(d.id));
    if (targets.length === 0) return;

    setBatchRunning(true);
    abortRef.current = false;
    setBatchProgress({ done: 0, total: targets.length });

    const CONCURRENCY = 3;
    let index = 0;
    let done = 0;

    async function processOne(draft: EmailDraft) {
      if (abortRef.current) return;
      setGeneratingIds((prev) => new Set(prev).add(draft.id));
      try {
        let websiteSummary = draft.websiteSummary ?? "";
        if (!websiteSummary && draft.website) {
          const enrichRes = await fetch("/api/enrich-website", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: draft.website }),
          });
          if (enrichRes.ok) {
            const enrichData = await enrichRes.json() as { summary: string };
            websiteSummary = enrichData.summary;
            updateEmailDraft(draft.id, { websiteSummary });
          }
        }

        if (abortRef.current) return;

        const genRes = await fetch("/api/generate-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buildingName: draft.buildingName,
            buildingAddress: draft.buildingAddress,
            recipientName: draft.recipientName,
            note: draft.bodyText || undefined,
            rolePrompt: rolePrompt || undefined,
            websiteSummary: websiteSummary || undefined,
          }),
        });

        if (!genRes.ok) throw new Error(`Generation failed (${genRes.status})`);
        const data = await genRes.json() as { subject: string; bodyText: string; bodyHtml: string };
        updateEmailDraft(draft.id, {
          subject: data.subject,
          bodyText: data.bodyText,
          bodyHtml: data.bodyHtml,
          status: "draft",
        });
      } catch {
        // leave as queued — user can retry individually
      } finally {
        setGeneratingIds((prev) => { const s = new Set(prev); s.delete(draft.id); return s; });
        done++;
        setBatchProgress({ done, total: targets.length });
      }
    }

    async function runWorker() {
      while (index < targets.length && !abortRef.current) {
        const item = targets[index++];
        await processOne(item);
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, runWorker);
    await Promise.all(workers);

    setBatchRunning(false);
    setBatchProgress(null);
    setSelectedIds(new Set());

    const freshDrafts = getEmailDrafts().filter((d) => d.status === "draft");
    if (freshDrafts.length > 0 && !selectedId) {
      selectItem(freshDrafts[0]);
    }
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function handleSend() {
    if (!selected || !editEmail.trim()) return;
    setSending(true);
    try {
      const bodyHtml = editBody.split("\n\n").map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n");
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: editEmail, cc: editCc.length > 0 ? editCc : undefined, subject: editSubject, bodyHtml, bodyText: editBody }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Send failed (${res.status})`);
      }

      updateEmailDraft(selected.id, { subject: editSubject, bodyText: editBody, bodyHtml, recipientEmail: editEmail, recipientName: editName, ccEmails: editCc.length > 0 ? editCc : undefined });
      markEmailSent(selected.id);

      // Auto-record contact log and schedule follow-up on the same entry
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + followUpDays);
      const logged = addContact({
        buildingId: selected.contactId,
        buildingName: selected.buildingName,
        buildingAddress: selected.buildingAddress,
        recipientEmail: editEmail,
        recipientName: editName,
        method: "email",
        note: `Email sent: ${editSubject}`,
        contactedAt: new Date().toISOString(),
        followUpAt: followUpDate.toISOString().slice(0, 10),
        followUpDone: false,
      });
      // Ensure follow-up is set (addContact may return existing if dedup)
      updateContact(logged.id, {
        followUpAt: followUpDate.toISOString().slice(0, 10),
        followUpDone: false,
      });

      // Show sync confirmation toast
      setSentToast({ name: selected.buildingName, email: editEmail });
      setTimeout(() => setSentToast(null), 6000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const pending = items.filter((d) => d.status !== "sent");
  const sent    = items.filter((d) => d.status === "sent");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontFamily: "var(--font-ui)" }}>

      {/* ── Sync confirmation toast ───────────────────── */}
      {sentToast && (
        <div style={{
          flexShrink: 0,
          padding: "10px 20px",
          background: "rgba(29,185,84,0.12)",
          borderBottom: "1px solid rgba(29,185,84,0.3)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "13px",
          color: "#1DB954",
        }}>
          <span style={{ fontWeight: 700 }}>✓ Email sent</span>
          <span style={{ color: "var(--text-secondary)" }}>
            {sentToast.name} · {sentToast.email} · Contact recorded + follow-up scheduled
          </span>
          {onGoToContacts && (
            <button
              onClick={onGoToContacts}
              style={{ marginLeft: "auto", fontSize: "12px", padding: "3px 12px", borderRadius: "4px", border: "1px solid #1DB954", background: "transparent", color: "#1DB954", cursor: "pointer", fontWeight: 600 }}
            >
              View in Contacts →
            </button>
          )}
          <button onClick={() => setSentToast(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: "14px", padding: "0 4px" }}>✕</button>
        </div>
      )}

    <div style={{ display: "flex", flex: 1, minHeight: 0, fontFamily: "var(--font-ui)" }}>

      {/* ── Left: Pipeline list ─────────────────────── */}
      <div style={{ width: "340px", flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-card)" }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>Email Pipeline</div>
              <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{pending.length} 待处理 · {sent.length} 已发送</div>
            </div>
            <button
              onClick={() => { setShowPrompt(true); setSelectedId(null); }}
              title="编辑 AI Prompt"
              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "4px", padding: "4px 8px", color: "var(--text-dim)", cursor: "pointer", fontSize: "13px" }}
            >⚙</button>
          </div>

          {pending.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
              <input
                type="checkbox"
                checked={selectedIds.size === pending.length && pending.length > 0}
                onChange={(e) => {
                  if (e.target.checked) setSelectedIds(new Set(pending.map((d) => d.id)));
                  else setSelectedIds(new Set());
                }}
                style={{ cursor: "pointer" }}
              />
              <span style={{ color: "var(--text-dim)", flex: 1 }}>
                {selectedIds.size > 0 ? `已选 ${selectedIds.size}` : "全选"}
              </span>
              {batchProgress && (
                <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>
                  {batchProgress.done}/{batchProgress.total}
                </span>
              )}
              <button
                onClick={batchRunning ? () => { abortRef.current = true; } : handleBatchGenerate}
                disabled={!batchRunning && selectedIds.size === 0}
                style={{
                  padding: "4px 10px",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                  background: batchRunning ? "rgba(239,68,68,0.1)" : "transparent",
                  color: batchRunning ? "#f87171" : "var(--amber)",
                  cursor: (!batchRunning && selectedIds.size === 0) ? "not-allowed" : "pointer",
                  fontSize: "11px",
                  fontWeight: 600,
                  opacity: (!batchRunning && selectedIds.size === 0) ? 0.4 : 1,
                }}
              >
                {batchRunning ? "停止" : "✦ 批量生成"}
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {items.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.6 }}>
              从 Scan 页点击<br /><span style={{ color: "var(--amber)" }}>✉ Email Agent</span><br />添加目标
            </div>
          )}

          {/* Pending section */}
          {pending.length > 0 && (
            <>
              <div style={{ padding: "10px 16px 4px", fontSize: "10px", letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>待处理</div>
              {pending.map((d) => (
                <PipelineItem
                  key={d.id}
                  d={d}
                  selected={selectedId === d.id}
                  leadStatus={pipeline[d.contactId]?.status}
                  isChecked={selectedIds.has(d.id)}
                  isGenerating={generatingIds.has(d.id)}
                  onClick={() => selectItem(d)}
                  onCheck={(checked) => {
                    setSelectedIds((prev) => {
                      const s = new Set(prev);
                      if (checked) s.add(d.id);
                      else s.delete(d.id);
                      return s;
                    });
                  }}
                />
              ))}
            </>
          )}

          {/* Sent section */}
          {sent.length > 0 && (
            <>
              <div style={{ padding: "10px 16px 4px", fontSize: "10px", letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>已发送</div>
              {sent.map((d) => (
                <PipelineItem
                  key={d.id}
                  d={d}
                  selected={selectedId === d.id}
                  leadStatus={pipeline[d.contactId]?.status}
                  isChecked={false}
                  isGenerating={false}
                  onClick={() => selectItem(d)}
                  onCheck={() => {}}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Right: Action panel ─────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "var(--bg)" }}>
        {showPrompt ? (
          <PromptEditor
            value={rolePrompt}
            onChange={setRolePrompt}
            onSave={(v) => { saveEmailPrompt(v); setRolePrompt(v); setShowPrompt(false); }}
            onClose={() => setShowPrompt(false)}
          />
        ) : !selected ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
            <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "14px" }}>← 从左侧选择目标</div>
            <button onClick={() => setShowPrompt(true)} style={{ fontSize: "12px", color: "var(--text-dim)", background: "transparent", border: "1px solid var(--border)", borderRadius: "4px", padding: "5px 14px", cursor: "pointer" }}>
              ⚙ 配置 AI Prompt
            </button>
          </div>
        ) : selected.status === "queued" ? (
          <QueuedPanel
            draft={selected}
            editEmail={editEmail}
            editName={editName}
            generating={generating}
            onEmailChange={setEditEmail}
            onNameChange={setEditName}
            onCcChange={setEditCc}
            onGenerate={handleGenerate}
            onDiscard={() => { deleteEmailDraft(selected.id); setSelectedId(null); }}
          />
        ) : selected.status === "draft" ? (
          <DraftPanel
            draft={selected}
            editSubject={editSubject}
            editBody={editBody}
            editEmail={editEmail}
            editName={editName}
            editCc={editCc}
            followUpDays={followUpDays}
            sending={sending}
            onSubjectChange={setEditSubject}
            onBodyChange={setEditBody}
            onEmailChange={setEditEmail}
            onNameChange={setEditName}
            onCcChange={setEditCc}
            onFollowUpChange={setFollowUpDays}
            onSend={handleSend}
            onDiscard={() => { deleteEmailDraft(selected.id); setSelectedId(null); }}
          />
        ) : (
          <SentPanel draft={selected} />
        )}
      </div>
    </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────── */

function PipelineItem({
  d, selected, leadStatus, isChecked, isGenerating, onClick, onCheck,
}: {
  d: EmailDraft;
  selected: boolean;
  leadStatus?: string;
  isChecked: boolean;
  isGenerating: boolean;
  onClick: () => void;
  onCheck: (checked: boolean) => void;
}) {
  const s = isGenerating
    ? { label: "✦ 生成中", color: "#a78bfa", bg: "rgba(167,139,250,0.12)" }
    : STATUS[d.status];
  const lm = leadStatus ? STATUS_META[leadStatus as keyof typeof STATUS_META] : null;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 16px",
        cursor: "pointer",
        borderLeft: selected ? `2px solid var(--amber)` : "2px solid transparent",
        background: selected ? "var(--bg-elevated)" : "transparent",
        transition: "background 0.1s",
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
      }}
    >
      {d.status === "queued" && (
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => { e.stopPropagation(); onCheck(e.target.checked); }}
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: "2px", flexShrink: 0, cursor: "pointer" }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "6px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.buildingName}
          </div>
          <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "3px", background: s.bg, color: s.color, flexShrink: 0, fontWeight: 600 }}>{s.label}</span>
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "3px", display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {d.recipientEmail || "未填邮箱"}
            {d.status === "sent" && d.sentAt && ` · ${new Date(d.sentAt).toLocaleDateString()}`}
          </span>
          {lm && <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: lm.bg, color: lm.color, flexShrink: 0, fontWeight: 600 }}>{lm.label}</span>}
        </div>
      </div>
    </div>
  );
}

function QueuedPanel({
  draft, editEmail, editName, generating,
  onEmailChange, onNameChange, onCcChange, onGenerate, onDiscard,
}: {
  draft: EmailDraft;
  editEmail: string; editName: string; generating: boolean;
  onEmailChange: (v: string) => void; onNameChange: (v: string) => void;
  onCcChange: (v: string[]) => void;
  onGenerate: () => void; onDiscard: () => void;
}) {
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState("");
  const onCcChangeRef = useRef(onCcChange);
  onCcChangeRef.current = onCcChange;

  // Auto-scrape on mount if no email but has website
  useEffect(() => {
    if (editEmail || !draft.website) return;
    let cancelled = false;
    setScraping(true);
    setScrapeMsg(`正在抓取 ${draft.website}…`);
    fetch("/api/scrape-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website: draft.website }),
    })
      .then((r) => r.json())
      .then((data: { emails?: string[] }) => {
        if (cancelled) return;
        const emails = data.emails ?? [];
        if (emails.length > 0) {
          onEmailChange(emails[0]);
          if (emails.length > 1) onCcChangeRef.current(emails.slice(1));
          setScrapeMsg(`找到 ${emails.length} 个邮箱，已填入第一个`);
        } else {
          setScrapeMsg("网站上未找到公开邮箱，请手动填写");
        }
      })
      .catch(() => { if (!cancelled) setScrapeMsg("抓取失败，请手动填写"); })
      .finally(() => { if (!cancelled) setScraping(false); });
    return () => { cancelled = true; };
  // Only run on mount for this draft
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  return (
    <div style={{ padding: "32px 40px", maxWidth: "560px" }}>
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{draft.buildingName}</div>
        {draft.buildingAddress && <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "4px" }}>{draft.buildingAddress}</div>}
      </div>

      {scraping && (
        <div style={{ marginBottom: "16px", fontSize: "13px", color: "var(--amber)", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span>
          {scrapeMsg}
        </div>
      )}
      {!scraping && scrapeMsg && (
        <div style={{ marginBottom: "16px", fontSize: "13px", color: editEmail ? "var(--amber)" : "var(--text-dim)" }}>
          {scrapeMsg}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Field label="收件人邮箱 *">
          <input value={editEmail} onChange={(e) => onEmailChange(e.target.value)} placeholder="contact@company.com" style={iStyle} />
        </Field>
        <Field label="收件人姓名">
          <input value={editName} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Mr Lim" style={iStyle} />
        </Field>

        <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
          <button
            onClick={onGenerate}
            disabled={generating || scraping || !editEmail.trim()}
            style={btnStyle(generating || scraping || !editEmail.trim(), "primary")}
          >
            {generating ? "AI 生成中…" : "✦ 生成草稿"}
          </button>
          <button onClick={onDiscard} style={btnStyle(false, "ghost")}>移除</button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function DraftPanel({
  draft, editSubject, editBody, editEmail, editName, editCc, followUpDays, sending,
  onSubjectChange, onBodyChange, onEmailChange, onNameChange, onCcChange, onFollowUpChange, onSend, onDiscard,
}: {
  draft: EmailDraft;
  editSubject: string; editBody: string; editEmail: string; editName: string; editCc: string[];
  followUpDays: number; sending: boolean;
  onSubjectChange: (v: string) => void; onBodyChange: (v: string) => void;
  onEmailChange: (v: string) => void; onNameChange: (v: string) => void; onCcChange: (v: string[]) => void;
  onFollowUpChange: (v: number) => void; onSend: () => void; onDiscard: () => void;
}) {
  return (
    <div style={{ padding: "24px 40px", maxWidth: "660px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{draft.buildingName}</div>
          {draft.buildingAddress && <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>{draft.buildingAddress}</div>}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={onDiscard} style={btnStyle(false, "danger")}>丢弃</button>
          <button onClick={onSend} disabled={sending || !editEmail.trim()} style={btnStyle(sending || !editEmail.trim(), "primary")}>
            {sending ? "发送中…" : "发送"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px" }}>
        <div style={{ flex: 1 }}>
          <Field label="收件人邮箱 (To)">
            <input value={editEmail} onChange={(e) => onEmailChange(e.target.value)} style={iStyle} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="收件人姓名">
            <input value={editName} onChange={(e) => onNameChange(e.target.value)} style={iStyle} />
          </Field>
        </div>
      </div>

      <Field label={`CC (${editCc.length} 个地址，逗号分隔)`}>
        <input
          value={editCc.join(", ")}
          onChange={(e) => {
            const vals = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            onCcChange(vals);
          }}
          placeholder="cc1@example.com, cc2@example.com"
          style={{ ...iStyle, color: editCc.length > 0 ? "var(--cyan)" : undefined }}
        />
      </Field>

      <Field label="主题">
        <input value={editSubject} onChange={(e) => onSubjectChange(e.target.value)} style={iStyle} />
      </Field>

      <Field label="正文">
        <textarea
          value={editBody}
          onChange={(e) => onBodyChange(e.target.value)}
          style={{ ...iStyle, height: "280px", resize: "vertical", lineHeight: 1.7, padding: "12px 14px" }}
        />
      </Field>

      <Field label={`发送后 ${followUpDays} 天自动设置 Follow-up`}>
        <input
          type="number" min={1} max={30} value={followUpDays}
          onChange={(e) => onFollowUpChange(Number(e.target.value))}
          style={{ ...iStyle, width: "80px" }}
        />
      </Field>
    </div>
  );
}

function SentPanel({ draft }: { draft: EmailDraft }) {
  return (
    <div style={{ padding: "32px 40px", maxWidth: "660px" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{draft.buildingName}</div>
        <div style={{ fontSize: "12px", color: "var(--amber)", marginTop: "6px" }}>
          ✓ 已发送至 {draft.recipientEmail}
          {draft.sentAt && ` · ${new Date(draft.sentAt).toLocaleString()}`}
          {" · Follow-up 已安排"}
        </div>
      </div>
      <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>{draft.subject}</div>
      <pre style={{ fontSize: "13px", color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.7, background: "var(--bg-card)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
        {draft.bodyText}
      </pre>
    </div>
  );
}

function PromptEditor({
  value, onChange, onSave, onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div style={{ padding: "32px 40px", maxWidth: "660px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>AI Role Prompt</div>
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>
            告诉 AI 你是谁、卖什么、语气风格
          </div>
        </div>
        <button onClick={() => { setDraft(DEFAULT_PROMPT); onChange(DEFAULT_PROMPT); }} style={{ fontSize: "12px", color: "var(--text-dim)", background: "transparent", border: "1px solid var(--border)", borderRadius: "4px", padding: "4px 12px", cursor: "pointer" }}>
          重置默认
        </button>
      </div>

      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
        style={{ ...iStyle, height: "340px", resize: "vertical", lineHeight: 1.7, padding: "14px 16px", whiteSpace: "pre-wrap" }}
      />

      <div style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.6 }}>
        变量提示：生成时会自动补充目标公司名称、地址、收件人姓名。
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <button onClick={() => onSave(draft)} style={btnStyle(false, "primary")}>保存</button>
        <button onClick={onClose} style={btnStyle(false, "ghost")}>取消</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "6px", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

const iStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 13px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "var(--font-ui)",
};

function btnStyle(disabled: boolean, variant: "primary" | "ghost" | "danger"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "9px 20px",
    borderRadius: "500px",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "13px",
    fontWeight: 600,
    fontFamily: "var(--font-ui)",
    opacity: disabled ? 0.45 : 1,
    transition: "opacity 0.15s",
  };
  if (variant === "primary") return { ...base, background: "var(--amber)", color: "#000" };
  if (variant === "danger")  return { ...base, background: "transparent", border: "1px solid var(--border)", color: "#f87171" };
  return { ...base, background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" };
}
