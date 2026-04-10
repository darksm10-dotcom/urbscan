"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Building, CompanyEnrichment, HunterContact, LeadStatus, PipelineEntry, SearchParams } from "@/types";
import { optimizeRoute, totalRouteDistance } from "@/lib/route";
import { getPipelineData, setLeadStatus, setLeadNote } from "@/lib/pipeline";
import { addContact, updateContact, getContactsForBuilding } from "@/lib/contacts";
import { ContactLog } from "@/types";

const BuildingMap = dynamic(() => import("./BuildingMap"), { ssr: false });

interface ResultsListProps {
  buildings: Building[];
  loading: boolean;
  error: string | null;
  searched: boolean;
  lastParams: SearchParams | null;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
}

type SortMode = "score" | "distance" | "type" | "route";

interface ScoreWeights { count: number; rating: number; proximity: number; }

const STATUS_META: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  new:       { label: "新线索", color: "var(--text-dim)",    bg: "transparent" },
  contacted: { label: "已联系", color: "var(--amber)",       bg: "rgba(212,160,60,0.08)" },
  following: { label: "跟进中", color: "var(--cyan)",         bg: "rgba(0,212,168,0.06)" },
  won:       { label: "成交",   color: "var(--green-bright)", bg: "rgba(90,138,74,0.08)" },
  lost:      { label: "放弃",   color: "#c07070",            bg: "rgba(180,60,60,0.08)" },
};

function formatDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(2)}km`;
}
function formatTotalDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

function computeWeightedScore(b: Building, radius: number, w: ScoreWeights): number {
  const countRaw  = Math.min(1, (b.reviewCount ?? 0) / 200);
  const ratingRaw = b.rating ? (b.rating - 1) / 4 : 0;
  const proxRaw   = Math.max(0, 1 - b.distance / radius);
  const total     = w.count + w.rating + w.proximity;
  if (total === 0) return 0;
  return Math.round(((countRaw * w.count + ratingRaw * w.rating + proxRaw * w.proximity) / total) * 100);
}

const WA_TEMPLATES: { id: string; label: string; text: (lead: string, name: string, company: string) => string }[] = [
  {
    id: "intro",
    label: "Initial Outreach",
    text: (lead, name, company) =>
      `Hi, I'm ${name || "[Your Name]"} from ${company || "[Your Company]"}.\n\nI came across ${lead} and believe we could offer something valuable for your business.\n\nWould you be open to a quick chat? 😊`,
  },
  {
    id: "followup",
    label: "Follow Up",
    text: (lead, name, company) =>
      `Hi there,\n\nThis is ${name || "[Your Name]"} from ${company || "[Your Company]"}. I reached out to ${lead} recently and wanted to follow up.\n\nWould you have a moment to connect this week? 🙏`,
  },
  {
    id: "pitch",
    label: "Product Pitch",
    text: (lead, name, company) =>
      `Hi ${lead},\n\nI'm ${name || "[Your Name]"} from ${company || "[Your Company]"}. We help businesses like yours with [your service/product].\n\nI'd love to share more — would you be interested? 📋`,
  },
  {
    id: "meeting",
    label: "Meeting Request",
    text: (lead, name, company) =>
      `Hi, I'm ${name || "[Your Name]"} from ${company || "[Your Company]"}.\n\nI'd like to arrange a brief 15–20 min visit with ${lead}'s team.\n\nWould this week or next work for you?`,
  },
];

function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}
function whatsappTemplateLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
function linkedinSearchLink(name: string): string {
  return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}`;
}
function gmapsLink(b: Building): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name + " " + b.address)}`;
}

function ScoreBadge({ score }: { score: number }) {
  const isHigh = score >= 70;
  const isMed  = score >= 40;
  const color  = isHigh ? "#7ab86a" : isMed ? "var(--amber)" : "var(--text-dim)";
  const label  = isHigh ? "HIGH" : isMed ? "MED" : "LOW";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ position: "relative", width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Sonar ping rings for HIGH leads */}
        {isHigh && <>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1px solid ${color}`, animation: "sonarPing 2.4s ease-out infinite", opacity: 0 }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1px solid ${color}`, animation: "sonarPing 2.4s ease-out 0.8s infinite", opacity: 0 }} />
        </>}
        <div style={{
          width: "32px", height: "32px", borderRadius: "50%",
          border: `2px solid ${color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px", color, fontWeight: 600,
          boxShadow: isHigh ? `0 0 10px 2px ${color}35, inset 0 0 8px ${color}15` : isMed ? `0 0 6px 0px ${color}25` : "none",
          background: isHigh ? `${color}08` : "transparent",
        }}>
          {score}
        </div>
      </div>
      <span style={{
        fontSize: "9px", color, letterSpacing: "0.12em", fontWeight: 600,
        textShadow: isHigh ? `0 0 8px ${color}` : "none",
      }}>{label}</span>
    </div>
  );
}

function StarRating({ rating }: { rating?: number }) {
  if (!rating) return <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>—</span>;
  const full = Math.floor(rating);
  return (
    <span style={{ fontSize: "13px", color: "var(--amber)", letterSpacing: "-1px" }}>
      {"★".repeat(full)}{"☆".repeat(5 - full)}
      <span style={{ fontSize: "15px", color: "var(--text-dim)", marginLeft: "4px", letterSpacing: "normal" }}>{rating.toFixed(1)}</span>
    </span>
  );
}

function PipelineStatusDot({ status }: { status: LeadStatus }) {
  const meta = STATUS_META[status];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
      {status !== "new" && (
        <span style={{ fontSize: "9px", color: meta.color, letterSpacing: "0.06em" }}>{meta.label}</span>
      )}
    </div>
  );
}

function ContactCard({ c }: { c: HunterContact }) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || null;
  const seniority: Record<string, string> = { senior: "高级", junior: "初级", executive: "高管", director: "总监", manager: "经理" };
  return (
    <div style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg)", marginBottom: "6px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
        <div>
          {name && <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500, marginBottom: "2px" }}>{name}</div>}
          {c.position && (
            <div style={{ fontSize: "13px", color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
              {c.position}
              {c.seniority && <span style={{ color: "var(--text-dim)", marginLeft: "6px" }}>· {seniority[c.seniority] ?? c.seniority}</span>}
            </div>
          )}
          {c.department && !c.position && <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>{c.department}</div>}
        </div>
        <div style={{ fontSize: "15px", padding: "2px 6px", borderRadius: "2px", border: `1px solid ${c.confidence >= 70 ? "rgba(90,138,74,0.4)" : c.confidence >= 40 ? "rgba(212,160,60,0.3)" : "var(--border)"}`, color: c.confidence >= 70 ? "var(--green-bright)" : c.confidence >= 40 ? "var(--amber)" : "var(--text-dim)", flexShrink: 0, letterSpacing: "0.08em" }}>
          {c.confidence}%
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <a href={`mailto:${c.email}`} style={{ fontSize: "15px", color: "var(--amber)", textDecoration: "none" }}>{c.email}</a>
        <button onClick={() => navigator.clipboard.writeText(c.email)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "2px", padding: "1px 6px", color: "var(--text-dim)", fontSize: "15px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>复制</button>
        {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: "13px", color: "var(--text-secondary)", textDecoration: "none" }}>{c.phone}</a>}
        {c.linkedin && <a href={c.linkedin} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "var(--text-dim)", textDecoration: "none" }}>in LinkedIn</a>}
      </div>
    </div>
  );
}

function EnrichmentCard({ e }: { e: CompanyEnrichment }) {
  return (
    <div style={{ padding: "10px 12px", border: "1px solid rgba(0,212,168,0.25)", borderRadius: "3px", background: "rgba(0,212,168,0.04)", marginBottom: "6px" }}>
      <div style={{ fontSize: "15px", color: "var(--cyan)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "8px" }}>◈ Apollo.io 公司数据</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        {e.employees && <span style={{ fontSize: "15px", color: "var(--text-secondary)" }}>👥 {e.employees} 人</span>}
        {e.industry && <span style={{ fontSize: "15px", color: "var(--text-secondary)" }}>⬡ {e.industry}</span>}
        {e.annualRevenue && <span style={{ fontSize: "15px", color: "var(--text-secondary)" }}>◇ {e.annualRevenue}</span>}
        {e.foundedYear && <span style={{ fontSize: "15px", color: "var(--text-dim)" }}>成立 {e.foundedYear}</span>}
      </div>
      {e.description && <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "6px", lineHeight: 1.5 }}>{e.description.slice(0, 160)}{e.description.length > 160 ? "…" : ""}</div>}
      {e.linkedinUrl && (
        <a href={e.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "var(--cyan)", textDecoration: "none", display: "inline-block", marginTop: "6px" }}>↗ LinkedIn 主页</a>
      )}
    </div>
  );
}


interface ComposerProps {
  phone: string;
  leadName: string;
  senderName: string;
  senderCompany: string;
  onSenderChange: (name: string, company: string) => void;
  onClose: () => void;
}

function WhatsAppComposer({ phone, leadName, senderName, senderCompany, onSenderChange, onClose }: ComposerProps) {
  const [activeTemplate, setActiveTemplate] = useState(WA_TEMPLATES[0].id);
  const [text, setText] = useState(() => WA_TEMPLATES[0].text(leadName, senderName, senderCompany));
  const [localName, setLocalName] = useState(senderName);
  const [localCompany, setLocalCompany] = useState(senderCompany);
  const [files, setFiles] = useState<File[]>([]);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyTemplate(id: string, name: string, company: string) {
    const t = WA_TEMPLATES.find((t) => t.id === id);
    if (t) setText(t.text(leadName, name, company));
    setActiveTemplate(id);
  }

  function handleSenderChange(name: string, company: string) {
    setLocalName(name);
    setLocalCompany(company);
    onSenderChange(name, company);
    applyTemplate(activeTemplate, name, company);
  }

  function handleSend() {
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank");
    if (files.length > 0) {
      setTimeout(() => alert(`✅ WhatsApp opened with your message.\n\nPlease attach ${files.length} file(s) manually in the WhatsApp window:\n${files.map((f) => `• ${f.name}`).join("\n")}`), 300);
    }
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
        <span style={{ fontSize: "13px", color: WA_GREEN, letterSpacing: "0.15em", textTransform: "uppercase" }}>💬 WhatsApp Composer</span>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-dim)", fontSize: "15px", cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ padding: "12px" }}>

        {/* Sender info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          {[
            { label: "Your Name", value: localName, key: "name" },
            { label: "Your Company", value: localCompany, key: "company" },
          ].map(({ label, value, key }) => (
            <div key={key}>
              <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
              <input
                value={value}
                placeholder={label}
                onChange={(e) => handleSenderChange(key === "name" ? e.target.value : localName, key === "company" ? e.target.value : localCompany)}
                style={{ width: "100%", background: "rgba(212,160,60,0.04)", border: "1px solid var(--border)", borderRadius: "3px", padding: "6px 9px", color: "var(--text-primary)", fontSize: "15px", fontFamily: "'JetBrains Mono', monospace", outline: "none" }}
              />
            </div>
          ))}
        </div>

        {/* Template tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "10px", flexWrap: "wrap" }}>
          {WA_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => applyTemplate(t.id, localName, localCompany)}
              style={{ fontSize: "15px", padding: "3px 10px", borderRadius: "2px", border: `1px solid ${activeTemplate === t.id ? WA_GREEN : "var(--border)"}`, background: activeTemplate === t.id ? "rgba(37,211,102,0.1)" : "transparent", color: activeTemplate === t.id ? WA_GREEN : "var(--text-secondary)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all 0.15s" }}
            >{t.label}</button>
          ))}
        </div>

        {/* Editable message */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          style={{ width: "100%", background: "rgba(37,211,102,0.03)", border, borderRadius: "3px", padding: "10px 12px", color: "var(--text-primary)", fontSize: "15px", fontFamily: "'JetBrains Mono', monospace", resize: "vertical", outline: "none", lineHeight: 1.6 }}
        />

        {/* File attachment */}
        <div style={{ marginTop: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ fontSize: "13px", background: "transparent", border, borderRadius: "3px", padding: "4px 12px", color: WA_GREEN, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
            >📎 Attach Files / Photos</button>
            {files.length > 0 && <span style={{ fontSize: "15px", color: "var(--text-dim)" }}>{files.length} file{files.length > 1 ? "s" : ""} selected</span>}
          </div>
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" onChange={handleFiles} style={{ display: "none" }} />

          {files.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
              {files.map((f, i) => {
                const isImg = f.type.startsWith("image/");
                const previewUrl = isImg ? URL.createObjectURL(f) : null;
                return (
                  <div key={i} style={{ position: "relative", border, borderRadius: "3px", overflow: "hidden", background: "rgba(37,211,102,0.04)" }}>
                    {previewUrl ? (
                      <img src={previewUrl} alt={f.name} style={{ width: "64px", height: "64px", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ width: "64px", height: "64px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                        <span style={{ fontSize: "16px" }}>📄</span>
                        <span style={{ fontSize: "8px", color: "var(--text-dim)", maxWidth: "56px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{f.name}</span>
                      </div>
                    )}
                    <button onClick={() => removeFile(i)} style={{ position: "absolute", top: "2px", right: "2px", background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: "16px", height: "16px", color: "#fff", fontSize: "9px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {files.length > 0 && (
            <div style={{ fontSize: "15px", color: "var(--text-dim)", padding: "6px 8px", borderRadius: "3px", border: "1px solid rgba(212,160,60,0.15)", background: "rgba(212,160,60,0.04)", lineHeight: 1.5 }}>
              ⚠ WhatsApp links only support pre-filled text. After clicking Send, attach your files manually in the WhatsApp window.
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <button onClick={handleSend}
            style={{ flex: 1, padding: "8px", background: "rgba(37,211,102,0.12)", border: `1px solid ${WA_GREEN}`, borderRadius: "3px", color: WA_GREEN, fontSize: "15px", fontWeight: 600, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}
          >💬 Open WhatsApp & Send</button>
          <button onClick={handleCopy}
            style={{ padding: "8px 14px", background: "transparent", border, borderRadius: "3px", color: copied ? WA_GREEN : "var(--text-secondary)", fontSize: "15px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all 0.2s" }}
          >{copied ? "✓ Copied" : "📋 Copy"}</button>
        </div>
      </div>
    </div>
  );
}

function StaticMapImage({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const marker = encodeURIComponent(`color:0xD4A03C|${lat},${lng}`);
  const style = [
    "element:geometry|color:0x1e1e1e",
    "element:labels.text.fill|color:0x7a6a4a",
    "element:labels.text.stroke|color:0x1e1e1e",
    "feature:road|element:geometry|color:0x2a2a2a",
    "feature:road|element:geometry.stroke|color:0x333333",
    "feature:water|element:geometry|color:0x111111",
  ].map((s) => `style=${encodeURIComponent(s)}`).join("&");
  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=17&size=600x120&scale=2&markers=${marker}&${style}&key=${apiKey}`;
  return (
    <img
      src={src}
      alt={`Map of ${name}`}
      loading="lazy"
      style={{ width: "100%", height: "90px", objectFit: "cover", borderRadius: "3px", border: "1px solid var(--border)", marginBottom: "10px", opacity: 0.75, display: "block" }}
    />
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", gap: "12px" }}>
      <div style={{ fontSize: "40px", color: "var(--text-dim)", fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>◈</div>
      <div style={{ fontSize: "13px", color: "var(--text-secondary)", letterSpacing: "0.15em", textTransform: "uppercase" }}>{message}</div>
      {sub && <div style={{ fontSize: "15px", color: "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

function exportCSV(buildings: Building[], pipeline: Record<string, PipelineEntry>, hunterData: Record<string, { contacts?: HunterContact[] }>) {
  const rows: string[] = [];
  rows.push("序号,企业名称,地址,类型,线索评分,Google评分,评论数,电话,网站,距离(m),纬度,经度,跟进状态,备注,联系人姓名,职位,邮箱,邮箱置信度");
  buildings.forEach((b, i) => {
    const p = pipeline[b.id];
    const status = p?.status ?? "new";
    const note = (p?.note ?? "").replace(/"/g, '""');
    const contacts = hunterData[b.id]?.contacts ?? [];
    if (contacts.length === 0) {
      rows.push(`${i + 1},"${b.name}","${b.address}","${b.type === "office" ? "写字楼" : "住宅"}",${b.score},${b.rating ?? ""},${b.reviewCount ?? ""},"${b.phone ?? ""}","${b.website ?? ""}",${b.distance},${b.lat},${b.lng},${STATUS_META[status].label},"${note}",,,,`);
    } else {
      contacts.forEach((c, ci) => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
        rows.push(`${ci === 0 ? i + 1 : ""},"${ci === 0 ? b.name : ""}","${ci === 0 ? b.address : ""}","${ci === 0 ? (b.type === "office" ? "写字楼" : "住宅") : ""}",${ci === 0 ? b.score : ""},${ci === 0 ? (b.rating ?? "") : ""},${ci === 0 ? (b.reviewCount ?? "") : ""},"${ci === 0 ? (b.phone ?? "") : ""}","${ci === 0 ? (b.website ?? "") : ""}",${ci === 0 ? b.distance : ""},${ci === 0 ? b.lat : ""},${ci === 0 ? b.lng : ""},${ci === 0 ? STATUS_META[status].label : ""},"${ci === 0 ? note : ""}","${name}","${c.position ?? ""}","${c.email}",${c.confidence}`);
      });
    }
  });
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `urbscan-b2b-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchContacts(website: string): Promise<HunterContact[]> {
  const res = await fetch("/api/hunter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "查询失败");
  return data.contacts as HunterContact[];
}

async function fetchEnrichment(website: string): Promise<CompanyEnrichment> {
  const res = await fetch("/api/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "增强查询失败");
  return data.enrichment as CompanyEnrichment;
}

export default function ResultsList({ buildings, loading, error, searched, lastParams, selectedId, onSelectId }: ResultsListProps) {
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<Record<string, PipelineEntry>>(() => getPipelineData());
  const [showUnvisited, setShowUnvisited] = useState(false);
  const [hunterData, setHunterData] = useState<Record<string, { loading: boolean; contacts?: HunterContact[]; error?: string }>>({});
  const [enrichData, setEnrichData] = useState<Record<string, { loading: boolean; data?: CompanyEnrichment; error?: string }>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<ScoreWeights>({ count: 4, rating: 4, proximity: 2 });
  const [showWeights, setShowWeights] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [showComposer, setShowComposer] = useState<string | null>(null); // buildingId
  const [contactLogs, setContactLogs] = useState<Record<string, ContactLog[]>>({});
  const [senderName, setSenderName] = useState<string>(() => (typeof window !== "undefined" ? localStorage.getItem("urbscan_sender_name") ?? "" : ""));
  const [senderCompany, setSenderCompany] = useState<string>(() => (typeof window !== "undefined" ? localStorage.getItem("urbscan_sender_company") ?? "" : ""));

  function handleSenderChange(name: string, company: string) {
    setSenderName(name);
    setSenderCompany(company);
    localStorage.setItem("urbscan_sender_name", name);
    localStorage.setItem("urbscan_sender_company", company);
  }

  const radius = lastParams?.radius ?? 5000;
  const primaryCenter = lastParams?.locations[0] ?? null;

  const buildingsWithScore = useMemo(() =>
    buildings.map((b) => ({ ...b, score: computeWeightedScore(b, radius, weights) })),
    [buildings, radius, weights]
  );

  const sorted = useMemo(() => {
    const active = pipeline;
    let list = showUnvisited
      ? buildingsWithScore.filter((b) => !active[b.id] || active[b.id].status === "new")
      : buildingsWithScore;
    switch (sortMode) {
      case "score":    return [...list].sort((a, b) => b.score - a.score);
      case "distance": return [...list].sort((a, b) => a.distance - b.distance);
      case "type":     return [...list].sort((a, b) => a.type.localeCompare(b.type) || a.distance - b.distance);
      case "route":    return primaryCenter ? optimizeRoute([...list], primaryCenter) : list;
      default:         return list;
    }
  }, [buildingsWithScore, sortMode, pipeline, showUnvisited, primaryCenter]);

  const routeTotal = useMemo(() => {
    if (sortMode !== "route" || !primaryCenter || sorted.length === 0) return null;
    return totalRouteDistance(sorted, primaryCenter);
  }, [sorted, sortMode, primaryCenter]);

  const highLeads = buildingsWithScore.filter((b) => b.score >= 70).length;
  const followingCount = buildings.filter((b) => pipeline[b.id]?.status === "following").length;
  const wonCount = buildings.filter((b) => pipeline[b.id]?.status === "won").length;

  function autoSyncContact(b: Building, status: LeadStatus, note: string) {
    const existing = getContactsForBuilding(b.id);
    if (existing.length > 0) {
      updateContact(existing[0].id, { note });
    } else if (status !== "new" || note.trim()) {
      addContact({
        buildingId: b.id,
        buildingName: b.name,
        buildingAddress: b.address,
        buildingPhone: b.phone,
        method: "other",
        note,
        contactedAt: new Date().toISOString(),
        followUpDone: false,
      });
    }
    setContactLogs((prev) => ({ ...prev, [b.id]: getContactsForBuilding(b.id) }));
  }

  function handleStatusChange(b: Building, status: LeadStatus) {
    setLeadStatus(b.id, status);
    setPipeline(getPipelineData());
    const currentNote = notes[b.id] ?? pipeline[b.id]?.note ?? "";
    autoSyncContact(b, status, currentNote);
  }

  function handleNoteBlur(b: Building, note: string) {
    setLeadNote(b.id, note);
    const currentStatus = pipeline[b.id]?.status ?? "new";
    autoSyncContact(b, currentStatus, note);
  }

  async function handleHunterLookup(b: Building) {
    if (!b.website || hunterData[b.id]) return;
    setHunterData((prev) => ({ ...prev, [b.id]: { loading: true } }));
    try {
      const contacts = await fetchContacts(b.website);
      setHunterData((prev) => ({ ...prev, [b.id]: { loading: false, contacts } }));
    } catch (err) {
      setHunterData((prev) => ({ ...prev, [b.id]: { loading: false, error: err instanceof Error ? err.message : "查询失败" } }));
    }
  }

  async function handleEnrichLookup(b: Building) {
    if (!b.website || enrichData[b.id]) return;
    setEnrichData((prev) => ({ ...prev, [b.id]: { loading: true } }));
    try {
      const data = await fetchEnrichment(b.website);
      setEnrichData((prev) => ({ ...prev, [b.id]: { loading: false, data } }));
    } catch (err) {
      setEnrichData((prev) => ({ ...prev, [b.id]: { loading: false, error: err instanceof Error ? err.message : "增强查询失败" } }));
    }
  }

  const handleBatchLookup = useCallback(async () => {
    const targets = buildings.filter((b) => b.website && !hunterData[b.id]);
    if (!targets.length || batchRunning) return;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: targets.length });
    for (const b of targets) {
      try {
        const contacts = await fetchContacts(b.website!);
        setHunterData((prev) => ({ ...prev, [b.id]: { loading: false, contacts } }));
      } catch {
        setHunterData((prev) => ({ ...prev, [b.id]: { loading: false, contacts: [] } }));
      }
      setBatchProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      await new Promise((r) => setTimeout(r, 700));
    }
    setBatchRunning(false);
  }, [buildings, hunterData, batchRunning]);

  function toggleRow(id: string) {
    const opening = expandedId !== id;
    setExpandedId(opening ? id : null);
    onSelectId(id === selectedId ? null : id);
    if (opening) setContactLogs((prev) => ({ ...prev, [id]: getContactsForBuilding(id) }));
  }

  if (loading) {
    return (
      <div style={{ animation: "fadeSlideIn 0.3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", padding: "10px 16px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg-card)" }}>
          <span style={{ animation: "spinnerRotate 1s linear infinite", display: "inline-block", color: "var(--amber)", fontSize: "15px" }}>◌</span>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)", letterSpacing: "0.08em" }}>正在并行扫描 B2B 线索...</span>
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ height: "60px", marginBottom: "4px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "3px", opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    );
  }

  if (error) return (
    <div style={{ padding: "16px 20px", border: "1px solid rgba(180,60,60,0.3)", borderRadius: "3px", background: "rgba(140,40,40,0.06)", color: "#c07070", fontSize: "13px", animation: "fadeSlideIn 0.3s ease" }}>
      <span style={{ color: "#b85050", marginRight: "8px" }}>✕ ERROR</span>{error}
    </div>
  );

  if (!searched) return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg-card)", animation: "fadeSlideIn 0.4s ease" }}>
      <EmptyState message="等待扫描指令" sub="在左侧选择行业和地点，开始搜索 B2B 线索" />
    </div>
  );

  if (buildings.length === 0) return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg-card)", animation: "fadeSlideIn 0.3s ease" }}>
      <EmptyState message="无结果" sub="尝试扩大范围或切换行业关键词" />
    </div>
  );

  return (
    <div style={{ animation: "fadeSlideIn 0.35s ease" }}>

      {/* Map */}
      {primaryCenter && (
        <div style={{ marginBottom: "16px" }}>
          <BuildingMap buildings={sorted} center={primaryCenter} selectedId={selectedId} onSelectId={onSelectId} />
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "14px" }}>
        {[
          { label: "线索总数", value: buildings.length, unit: "条", color: "var(--amber)",       glow: "rgba(212,160,60,0.15)" },
          { label: "高价值",   value: highLeads,        unit: "条", color: "var(--green-bright)", glow: "rgba(122,184,106,0.12)" },
          { label: "跟进中",   value: followingCount,   unit: "条", color: "var(--cyan)",         glow: "rgba(0,212,168,0.12)" },
          { label: "已成交",   value: wonCount,         unit: "条", color: "var(--green-bright)", glow: "rgba(122,184,106,0.12)" },
        ].map((s) => (
          <div key={s.label} className="tac-corners" style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg-card)", transition: "box-shadow 0.3s", boxShadow: s.value > 0 ? `0 0 20px ${s.glow}` : "none" }}>
            <div style={{ fontSize: "15px", color: "var(--text-dim)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "6px" }}>{s.label}</div>
            <div style={{ fontSize: "22px", color: s.color, lineHeight: 1, fontWeight: 300, textShadow: s.value > 0 ? `0 0 12px ${s.glow}` : "none" }}>
              {s.value}<span style={{ fontSize: "13px", color: "var(--text-dim)", marginLeft: "4px" }}>{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", gap: "8px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", color: "var(--text-dim)", letterSpacing: "0.15em", marginRight: "4px" }}>排序</span>
          {([
            { mode: "distance", label: "距离 ↑" },
            { mode: "score",    label: "评分" },
            { mode: "type",     label: "类型" },
            { mode: "route",    label: "路线" },
          ] as { mode: SortMode; label: string }[]).map(({ mode, label: lbl }) => (
            <button key={mode} onClick={() => setSortMode(mode)}
              style={{ background: sortMode === mode ? "rgba(212,160,60,0.12)" : "transparent", border: `1px solid ${sortMode === mode ? "var(--amber)" : "var(--border)"}`, borderRadius: "3px", padding: "3px 10px", color: sortMode === mode ? "var(--amber)" : "var(--text-secondary)", fontSize: "13px", letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
            >{lbl}</button>
          ))}
          <button onClick={() => setShowUnvisited(!showUnvisited)}
            style={{ background: showUnvisited ? "rgba(0,212,168,0.08)" : "transparent", border: `1px solid ${showUnvisited ? "var(--cyan)" : "var(--border)"}`, borderRadius: "3px", padding: "3px 10px", color: showUnvisited ? "var(--cyan)" : "var(--text-secondary)", fontSize: "13px", letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
          >{showUnvisited ? "仅新线索" : "全部线索"}</button>
          <button onClick={() => setShowWeights(!showWeights)}
            style={{ background: showWeights ? "rgba(212,160,60,0.08)" : "transparent", border: `1px solid ${showWeights ? "var(--border-bright)" : "var(--border)"}`, borderRadius: "3px", padding: "3px 10px", color: showWeights ? "var(--amber-dim)" : "var(--text-dim)", fontSize: "13px", letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
          >权重</button>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {routeTotal !== null && (
            <span style={{ fontSize: "13px", color: "var(--amber-dim)", letterSpacing: "0.05em" }}>总路程 {formatTotalDistance(routeTotal)}</span>
          )}
          {batchRunning ? (
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              <span style={{ animation: "spinnerRotate 1s linear infinite", display: "inline-block", marginRight: "4px" }}>◌</span>
              {batchProgress.done}/{batchProgress.total}
            </span>
          ) : (
            <button onClick={handleBatchLookup}
              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "3px", padding: "4px 10px", color: "var(--text-secondary)", fontSize: "13px", letterSpacing: "0.06em", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--amber)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--amber)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
              title="批量查找所有有网站的企业联系人"
            >⬡ 批量联系人</button>
          )}
          <button onClick={() => exportCSV(sorted, pipeline, hunterData)}
            style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "3px", padding: "4px 12px", color: "var(--text-secondary)", fontSize: "13px", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--amber)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--amber)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
          >↓ CSV</button>
        </div>
      </div>

      {/* Weight sliders */}
      {showWeights && (
        <div style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg-card)", marginBottom: "8px", animation: "fadeSlideIn 0.2s ease" }}>
          <div style={{ fontSize: "15px", color: "var(--text-dim)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "10px" }}>评分权重调整（影响 HIGH/MED/LOW 分级）</div>
          {([
            { key: "count",     label: "活跃度（评论数）" },
            { key: "rating",    label: "评级（Google星级）" },
            { key: "proximity", label: "距离（越近越高）" },
          ] as { key: keyof ScoreWeights; label: string }[]).map(({ key, label: lbl }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)", width: "130px", flexShrink: 0 }}>{lbl}</span>
              <input type="range" min={0} max={10} value={weights[key]}
                onChange={(e) => setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: "var(--amber)", height: "2px" }}
              />
              <span style={{ fontSize: "15px", color: "var(--amber)", width: "16px", textAlign: "right", flexShrink: 0 }}>{weights[key]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 80px 60px 60px 70px", gap: "0 8px", padding: "6px 14px", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "rgba(212,160,60,0.03)", marginBottom: "2px" }}>
        {["#", "企业名称 / 地址", "评分", "评级", "距离 ↑", "状态"].map((h) => (
          <div key={h}
            onClick={h === "距离 ↑" ? () => setSortMode("distance") : undefined}
            style={{ fontSize: "15px", color: h === "距离 ↑" && sortMode === "distance" ? "var(--amber)" : "var(--text-dim)", letterSpacing: "0.18em", textTransform: "uppercase", cursor: h === "距离 ↑" ? "pointer" : "default" }}
          >{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div>
        {sorted.map((b, i) => {
          const isExpanded = expandedId === b.id;
          const isSelected = selectedId === b.id;
          const pEntry = pipeline[b.id];
          const status: LeadStatus = pEntry?.status ?? "new";
          const isInactive = status === "won" || status === "lost";
          return (
            <div key={b.id} style={{ animation: `rowReveal 0.3s ease ${Math.min(i * 0.03, 0.4)}s both`, opacity: isInactive ? 0.45 : 1 }}>
              <div
                onClick={() => toggleRow(b.id)}
                style={{ display: "grid", gridTemplateColumns: "36px 1fr 80px 60px 60px 70px", gap: "0 8px", padding: "10px 14px", borderBottom: isExpanded ? "none" : "1px solid rgba(212,160,60,0.06)", background: isSelected ? "rgba(212,160,60,0.07)" : i % 2 === 0 ? "transparent" : "rgba(212,160,60,0.01)", cursor: "pointer", transition: "background 0.15s, box-shadow 0.2s", borderLeft: `2px solid ${isSelected ? "var(--amber)" : b.score >= 70 ? "rgba(122,184,106,0.5)" : STATUS_META[status].color === "var(--text-dim)" ? "transparent" : STATUS_META[status].color + "55"}` }}
                onMouseEnter={(e) => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.background = "rgba(212,160,60,0.055)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "inset 0 0 40px rgba(212,160,60,0.04)"; } }}
                onMouseLeave={(e) => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.background = i % 2 === 0 ? "transparent" : "rgba(212,160,60,0.01)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; } }}
              >
                <div style={{ fontSize: "15px", color: "var(--text-dim)", alignSelf: "center", fontWeight: 300 }}>
                  {sortMode === "route" ? <span style={{ color: "var(--amber)", fontSize: "13px", fontWeight: 600 }}>{i + 1}</span> : String(i + 1).padStart(2, "0")}
                </div>
                <div style={{ minWidth: 0, alignSelf: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{b.name}</span>
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.address}</div>
                </div>
                <div style={{ alignSelf: "center" }}><ScoreBadge score={b.score} /></div>
                <div style={{ alignSelf: "center" }}>
                  <StarRating rating={b.rating} />
                  {b.reviewCount ? <div style={{ fontSize: "15px", color: "var(--text-dim)", marginTop: "2px" }}>{b.reviewCount}条</div> : null}
                </div>
                <div style={{ alignSelf: "center", textAlign: "right" }}>
                  <div style={{ fontSize: "15px", color: "var(--amber-dim)", marginBottom: "3px" }}>{formatDistance(b.distance)}</div>
                  <div style={{ height: "2px", background: "var(--bg-elevated)", borderRadius: "1px" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.round((b.distance / radius) * 100))}%`, background: "var(--amber-dim)", borderRadius: "1px" }} />
                  </div>
                </div>
                <div style={{ alignSelf: "center" }}><PipelineStatusDot status={status} /></div>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ padding: "12px 14px 16px 50px", borderBottom: "1px solid rgba(212,160,60,0.08)", background: "rgba(212,160,60,0.03)", animation: "fadeSlideIn 0.2s ease" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Phone + WhatsApp */}
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
                    {b.phone ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>☎</span>
                          <a href={`tel:${b.phone}`} style={{ fontSize: "13px", color: "var(--amber)", textDecoration: "none", fontWeight: 500 }}>{b.phone}</a>
                          <button onClick={() => navigator.clipboard.writeText(b.phone!)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "2px", padding: "1px 6px", color: "var(--text-dim)", fontSize: "15px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>复制</button>
                        </div>
                        <button
                          onClick={() => setShowComposer(showComposer === b.id ? null : b.id)}
                          style={{ fontSize: "13px", color: "#25d366", background: showComposer === b.id ? "rgba(37,211,102,0.12)" : "transparent", border: "1px solid rgba(37,211,102,0.3)", borderRadius: "2px", padding: "2px 8px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}
                        >💬 WhatsApp</button>
                      </>
                    ) : (
                      <span style={{ fontSize: "15px", color: "var(--text-dim)" }}>☎ 无电话</span>
                    )}
                    {b.website && (
                      <a href={b.website} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: "15px", color: "var(--text-secondary)", textDecoration: "none", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >{b.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>
                    )}
                  </div>

                  {/* WhatsApp Composer */}
                  {showComposer === b.id && b.phone && (
                    <WhatsAppComposer
                      phone={b.phone}
                      leadName={b.name}
                      senderName={senderName}
                      senderCompany={senderCompany}
                      onSenderChange={handleSenderChange}
                      onClose={() => setShowComposer(null)}
                    />
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                    <a href={gmapsLink(b)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "var(--amber)", border: "1px solid var(--border-bright)", borderRadius: "2px", padding: "2px 10px", textDecoration: "none" }}>↗ Google Maps</a>
                    <a href={linkedinSearchLink(b.name)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "var(--cyan)", border: "1px solid rgba(0,212,168,0.3)", borderRadius: "2px", padding: "2px 10px", textDecoration: "none" }}>in LinkedIn</a>
                    <span style={{ fontSize: "15px", color: "var(--text-dim)", letterSpacing: "0.04em" }}>
                    ◈ <span style={{ color: "var(--cyan-dim)" }}>{b.lat.toFixed(5)}</span>, <span style={{ color: "var(--cyan-dim)" }}>{b.lng.toFixed(5)}</span> · {b.distance}m
                  </span>
                  </div>

                  {/* Contact history (auto-synced) */}
                  {contactLogs[b.id]?.length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "15px", color: "var(--text-dim)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px" }}>已记录跟进</div>
                      {contactLogs[b.id].slice(0, 3).map((c) => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px", borderBottom: "1px solid rgba(212,160,60,0.05)", fontSize: "13px" }}>
                          <span>{c.method === "whatsapp" ? "💬" : c.method === "call" ? "📞" : c.method === "email" ? "✉" : c.method === "visit" ? "🏢" : "◈"}</span>
                          <span style={{ color: "var(--text-dim)" }}>{new Date(c.contactedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</span>
                          {c.note && <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{c.note}</span>}
                          {c.followUpAt && !c.followUpDone && (
                            <span style={{ fontSize: "15px", color: c.followUpAt < new Date().toISOString().slice(0, 10) ? "#c07070" : "var(--amber)", flexShrink: 0 }}>🔔 {c.followUpAt}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Enrichment buttons */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                    {b.website && !hunterData[b.id] && (
                      <button onClick={() => handleHunterLookup(b)} style={{ fontSize: "13px", background: "rgba(212,160,60,0.08)", border: "1px solid var(--amber)", borderRadius: "2px", padding: "2px 10px", color: "var(--amber)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>⬡ 联系人</button>
                    )}
                    {b.website && !enrichData[b.id] && (
                      <button onClick={() => handleEnrichLookup(b)} style={{ fontSize: "13px", background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.4)", borderRadius: "2px", padding: "2px 10px", color: "var(--cyan)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>◈ 公司增强</button>
                    )}
                  </div>

                  {/* Pipeline status */}
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "15px", color: "var(--text-dim)", letterSpacing: "0.15em", textTransform: "uppercase", marginRight: "4px" }}>状态</span>
                    {(Object.keys(STATUS_META) as LeadStatus[]).map((s) => (
                      <button key={s} onClick={() => handleStatusChange(b, s)}
                        style={{ fontSize: "15px", padding: "2px 8px", borderRadius: "2px", border: `1px solid ${status === s ? STATUS_META[s].color : "var(--border)"}`, background: status === s ? STATUS_META[s].bg : "transparent", color: status === s ? STATUS_META[s].color : "var(--text-dim)", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}
                      >{STATUS_META[s].label}</button>
                    ))}
                  </div>

                  {/* Notes */}
                  <textarea
                    placeholder="添加备注..."
                    defaultValue={pEntry?.note ?? ""}
                    onBlur={(e) => handleNoteBlur(b, e.target.value)}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    style={{ width: "100%", background: "rgba(212,160,60,0.03)", border: "1px solid var(--border)", borderRadius: "3px", padding: "8px 10px", color: "var(--text-primary)", fontSize: "15px", fontFamily: "'JetBrains Mono', monospace", resize: "vertical", minHeight: "56px", outline: "none", lineHeight: 1.5 }}
                  />

                  {/* Hunter results */}
                  {hunterData[b.id] && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "15px", color: "var(--text-dim)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "8px" }}>◈ 联系人（Hunter.io）</div>
                      {hunterData[b.id].loading && <div style={{ fontSize: "15px", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "6px" }}><span style={{ animation: "spinnerRotate 1s linear infinite", display: "inline-block" }}>◌</span>正在查找...</div>}
                      {hunterData[b.id].error && <div style={{ fontSize: "15px", color: "#b85050" }}>✕ {hunterData[b.id].error}</div>}
                      {hunterData[b.id].contacts?.length === 0 && <div style={{ fontSize: "15px", color: "var(--text-dim)" }}>该域名暂无公开联系人</div>}
                      {hunterData[b.id].contacts?.map((c) => <ContactCard key={c.email} c={c} />)}
                    </div>
                  )}

                  {/* Apollo enrichment results */}
                  {enrichData[b.id] && (
                    <div style={{ marginTop: "12px" }}>
                      {enrichData[b.id].loading && <div style={{ fontSize: "15px", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "6px" }}><span style={{ animation: "spinnerRotate 1s linear infinite", display: "inline-block" }}>◌</span>正在增强...</div>}
                      {enrichData[b.id].error && <div style={{ fontSize: "15px", color: "#b85050" }}>✕ {enrichData[b.id].error}</div>}
                      {enrichData[b.id].data && <EnrichmentCard e={enrichData[b.id].data!} />}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "12px", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "13px", color: "var(--text-dim)", letterSpacing: "0.12em" }}>显示 {sorted.length} / {buildings.length} 条线索</span>
        <span style={{ fontSize: "13px", color: "var(--text-dim)", letterSpacing: "0.12em" }}>{sortMode === "route" ? "OPTIMIZED ROUTE" : `SORTED BY ${sortMode.toUpperCase()}`}</span>
      </div>
    </div>
  );
}
