"use client";

import { useState, useRef, useMemo } from "react";
import { WaTemplate, loadTemplates, persistTemplates, loadLastTemplateId, saveLastTemplateId, loadPhoneTemplateId, savePhoneTemplateId, interpolateTemplate } from "@/lib/wa-templates";

const UNFILLED_RE = /\{[a-zA-Z]+\}/g;

function findUnfilledVars(text: string): string[] {
  return [...new Set(text.match(UNFILLED_RE) ?? [])];
}

function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}
function whatsappTemplateLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export interface ComposerProps {
  phone: string;
  leadName: string;
  senderName: string;
  senderCompany: string;
  onSenderChange: (name: string, company: string) => void;
  onClose: () => void;
}

export default function WhatsAppComposer({ phone, leadName, senderName, senderCompany, onSenderChange, onClose }: ComposerProps) {
  const phoneDigits = phone.replace(/\D/g, "");
  const storageKey = `wa_draft_${phoneDigits}`;
  const [{ templates: initTemplates, activeId: initActiveId, text: initText }] = useState(() => {
    const list = loadTemplates();
    const perPhone = loadPhoneTemplateId(phoneDigits);
    const lastGlobal = loadLastTemplateId();
    const id = list.find((t) => t.id === (perPhone || lastGlobal))?.id ?? list[0]?.id ?? "";
    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    const t = list.find((tmpl) => tmpl.id === id) ?? list[0];
    return {
      templates: list,
      activeId: id,
      text: saved ?? (t ? interpolateTemplate(t.body, leadName, senderName, senderCompany) : ""),
    };
  });
  const [templates, setTemplates] = useState<WaTemplate[]>(initTemplates);
  const [activeTemplate, setActiveTemplate] = useState(initActiveId);
  const [text, setText] = useState(initText);
  const [draftSaved, setDraftSaved] = useState(false);
  const [localName, setLocalName] = useState(senderName);
  const [localCompany, setLocalCompany] = useState(senderCompany);
  const [files, setFiles] = useState<File[]>([]);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const unfilledVars = useMemo(() => findUnfilledVars(text), [text]);

  // Template management state
  const [formMode, setFormMode] = useState<"none" | "new" | "edit">("none");
  const [formLabel, setFormLabel] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formEditId, setFormEditId] = useState<string | null>(null);

  function saveText(val: string) {
    setText(val);
    localStorage.setItem(storageKey, val);
  }

  function applyTemplate(id: string, name: string, company: string, tmplList: WaTemplate[] = templates) {
    const t = tmplList.find((t) => t.id === id);
    if (t) saveText(interpolateTemplate(t.body, leadName, name, company));
    setActiveTemplate(id);
    saveLastTemplateId(id);
    savePhoneTemplateId(phoneDigits, id);
  }

  function saveDraft() {
    // Un-interpolate: replace actual values back to placeholders, then save as template body
    let body = text;
    if (leadName) body = body.split(leadName).join("{lead}");
    if (localName) body = body.split(localName).join("{name}");
    if (localCompany) body = body.split(localCompany).join("{company}");

    const updated = templates.map((t) =>
      t.id === activeTemplate ? { ...t, body } : t
    );
    setTemplates(updated);
    persistTemplates(updated);
    // Clear per-company overrides so all companies use the updated template
    const allKeys = Object.keys(localStorage).filter((k) => k.startsWith("wa_draft_"));
    allKeys.forEach((k) => localStorage.removeItem(k));
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  }

  function handleSenderChange(name: string, company: string) {
    setLocalName(name);
    setLocalCompany(company);
    onSenderChange(name, company);
    applyTemplate(activeTemplate, name, company);
  }

  function openNewForm() {
    setFormMode("new");
    setFormLabel("");
    setFormBody("");
    setFormEditId(null);
  }

  function openEditForm(t: WaTemplate) {
    setFormMode("edit");
    setFormLabel(t.label);
    setFormBody(t.body);
    setFormEditId(t.id);
  }

  function saveForm() {
    if (!formLabel.trim() || !formBody.trim()) return;
    let updated: WaTemplate[];
    if (formMode === "new") {
      const newT: WaTemplate = {
        id: `custom_${Date.now()}`,
        label: formLabel.trim(),
        body: formBody.trim(),
      };
      updated = [...templates, newT];
      setTemplates(updated);
      persistTemplates(updated);
      applyTemplate(newT.id, localName, localCompany, updated);
    } else if (formMode === "edit" && formEditId) {
      updated = templates.map((t) =>
        t.id === formEditId ? { ...t, label: formLabel.trim(), body: formBody.trim() } : t
      );
      setTemplates(updated);
      persistTemplates(updated);
      if (activeTemplate === formEditId) {
        applyTemplate(formEditId, localName, localCompany, updated);
      }
    } else {
      return;
    }
    setFormMode("none");
  }

  async function handleSend() {
    if (files.length > 0 && typeof navigator.share === "function" && navigator.canShare?.({ files, text })) {
      try {
        await navigator.share({ text, files });
        return;
      } catch {
        // user cancelled or share failed — fall through to wa.me
      }
    }
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank");
  }

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    e.target.value = "";
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  const WA_GREEN = "#25d366";
  const border = `1px solid rgba(37,211,102,0.25)`;

  return (
    <div style={{ marginBottom: "12px", border: "1px solid rgba(37,211,102,0.3)", borderRadius: "4px", background: "rgba(37,211,102,0.03)", animation: "fadeSlideIn 0.2s ease", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: border, background: "rgba(37,211,102,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "13px", color: WA_GREEN, letterSpacing: "0.15em", textTransform: "uppercase" }}>💬 WhatsApp</span>
          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>→</span>
          <span style={{ fontSize: "13px", color: "var(--amber)", fontWeight: 600 }}>{leadName}</span>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-dim)", fontSize: "15px", cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {/* From row — set once, applies to all templates */}
      <div style={{ display: "flex", gap: "6px", padding: "8px 12px", borderBottom: border, background: "rgba(0,0,0,0.15)", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "var(--text-dim)", flexShrink: 0, letterSpacing: "0.08em" }}>FROM</span>
        <input
          value={localName}
          onChange={(e) => handleSenderChange(e.target.value, localCompany)}
          placeholder="Your name"
          style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "12px", padding: "2px 4px", outline: "none", fontFamily: "'JetBrains Mono', monospace", minWidth: 0 }}
        />
        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>@</span>
        <input
          value={localCompany}
          onChange={(e) => handleSenderChange(localName, e.target.value)}
          placeholder="Your company"
          style={{ flex: 2, background: "transparent", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "12px", padding: "2px 4px", outline: "none", fontFamily: "'JetBrains Mono', monospace", minWidth: 0 }}
        />
      </div>

      <div style={{ padding: "12px" }}>

        {/* Template selector row */}
        <div style={{ display: "flex", gap: "6px", marginBottom: formMode !== "none" ? "8px" : "10px", alignItems: "center" }}>
          <select
            value={activeTemplate}
            onChange={(e) => applyTemplate(e.target.value, localName, localCompany)}
            style={{
              flex: 1,
              background: "rgba(37,211,102,0.06)",
              border: `1px solid ${WA_GREEN}`,
              borderRadius: "2px",
              color: WA_GREEN,
              fontSize: "13px",
              padding: "4px 8px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer",
              outline: "none",
              minWidth: 0,
            }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <button
            onClick={() => { const t = templates.find((t) => t.id === activeTemplate); if (t) openEditForm(t); }}
            title="Edit template"
            style={{ background: "transparent", border: `1px solid var(--border)`, borderRadius: "2px", color: WA_GREEN, fontSize: "13px", padding: "4px 8px", cursor: "pointer", lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}
          >✎</button>
          <button
            onClick={formMode === "new" ? () => setFormMode("none") : openNewForm}
            style={{
              fontSize: "13px",
              padding: "4px 10px",
              borderRadius: "2px",
              border: `1px solid ${formMode === "new" ? WA_GREEN : "var(--border)"}`,
              background: formMode === "new" ? "rgba(37,211,102,0.1)" : "transparent",
              color: formMode === "new" ? WA_GREEN : "var(--text-dim)",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: "nowrap",
            }}
          >+ New</button>
        </div>

        {/* Inline template form */}
        {formMode !== "none" && (
          <div style={{ marginBottom: "10px", padding: "10px", border: `1px solid rgba(37,211,102,0.2)`, borderRadius: "3px", background: "rgba(37,211,102,0.04)", animation: "fadeSlideIn 0.15s ease" }}>
            <div style={{ fontSize: "11px", color: WA_GREEN, letterSpacing: "0.1em", marginBottom: "8px", textTransform: "uppercase" }}>
              {formMode === "new" ? "New Template" : "Edit Template"}
            </div>
            <input
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              placeholder="Template name"
              style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "3px", padding: "5px 8px", color: "var(--text-primary)", fontSize: "13px", outline: "none", marginBottom: "6px", fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box" }}
            />
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              placeholder={"Message body...\nUse {lead}, {name}, {company} as placeholders"}
              rows={5}
              style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "3px", padding: "6px 8px", color: "var(--text-primary)", fontSize: "13px", outline: "none", fontFamily: "'JetBrains Mono', monospace", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }}
            />
            <div style={{ fontSize: "11px", color: "var(--text-dim)", margin: "5px 0 8px" }}>
              Variables: <span style={{ color: WA_GREEN }}>{"{lead}"}</span> · <span style={{ color: WA_GREEN }}>{"{name}"}</span> · <span style={{ color: WA_GREEN }}>{"{company}"}</span>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={saveForm}
                disabled={!formLabel.trim() || !formBody.trim()}
                style={{ fontSize: "12px", padding: "4px 14px", borderRadius: "2px", border: `1px solid ${WA_GREEN}`, background: "rgba(37,211,102,0.12)", color: WA_GREEN, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", opacity: (!formLabel.trim() || !formBody.trim()) ? 0.45 : 1 }}
              >Save</button>
              <button
                onClick={() => setFormMode("none")}
                style={{ fontSize: "12px", padding: "4px 12px", borderRadius: "2px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
              >Cancel</button>
            </div>
          </div>
        )}

        {/* Editable message */}
        <textarea
          value={text}
          onChange={(e) => saveText(e.target.value)}
          rows={6}
          style={{ width: "100%", background: "rgba(37,211,102,0.03)", border, borderRadius: "3px", padding: "10px 12px", color: "var(--text-primary)", fontSize: "15px", fontFamily: "'JetBrains Mono', monospace", resize: "vertical", outline: "none", lineHeight: 1.6 }}
        />

        {/* File attachments */}
        <div style={{ marginTop: "10px" }}>
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" onChange={handleFiles} style={{ display: "none" }} />

          {files.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
              {files.map((f, i) => {
                const isImg = f.type.startsWith("image/");
                const previewUrl = isImg ? URL.createObjectURL(f) : null;
                return (
                  <div key={i} style={{ position: "relative", border, borderRadius: "3px", overflow: "hidden", background: "rgba(37,211,102,0.04)" }}>
                    {previewUrl ? (
                      <img src={previewUrl} alt={f.name} style={{ width: "56px", height: "56px", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ width: "56px", height: "56px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px" }}>
                        <span style={{ fontSize: "18px" }}>📄</span>
                        <span style={{ fontSize: "8px", color: "var(--text-dim)", maxWidth: "50px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{f.name}</span>
                      </div>
                    )}
                    <button onClick={() => removeFile(i)} style={{ position: "absolute", top: "2px", right: "2px", background: "rgba(0,0,0,0.65)", border: "none", borderRadius: "50%", width: "15px", height: "15px", color: "#fff", fontSize: "9px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Unfilled variable warning */}
        {unfilledVars.length > 0 && (
          <div style={{
            padding: "6px 10px",
            borderRadius: "4px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            fontSize: "12px",
            color: "#ef4444",
            marginBottom: "8px",
          }}>
            ⚠ 未填变量: {unfilledVars.join(", ")}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ padding: "8px 12px", background: "transparent", border, borderRadius: "3px", color: files.length > 0 ? WA_GREEN : "var(--text-dim)", fontSize: "15px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}
            title="Attach files"
          >📎{files.length > 0 ? ` ${files.length}` : ""}</button>
          <button onClick={handleSend}
            style={{ flex: 1, padding: "8px", background: "rgba(37,211,102,0.12)", border: `1px solid ${WA_GREEN}`, borderRadius: "3px", color: WA_GREEN, fontSize: "15px", fontWeight: 600, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}
          >💬 {files.length > 0 ? "Share via WhatsApp" : "Open WhatsApp & Send"}</button>
          <button onClick={saveDraft}
            title="Save this message as the template (applies to all companies)"
            style={{ padding: "8px 12px", background: draftSaved ? "rgba(0,212,168,0.1)" : "transparent", border: draftSaved ? "1px solid var(--cyan)" : border, borderRadius: "3px", color: draftSaved ? "var(--cyan)" : "var(--text-secondary)", fontSize: "13px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all 0.2s", whiteSpace: "nowrap" }}
          >{draftSaved ? "✓ Saved" : "💾 Save Template"}</button>
          <button onClick={handleCopy}
            style={{ padding: "8px 14px", background: "transparent", border, borderRadius: "3px", color: copied ? WA_GREEN : "var(--text-secondary)", fontSize: "15px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all 0.2s" }}
          >{copied ? "✓" : "📋"}</button>
        </div>
      </div>
    </div>
  );
}
